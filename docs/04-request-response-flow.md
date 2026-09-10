# Request / response flow

Three flows worth drawing: the audited write (the one the whole system exists for), sign-in, and
what happens when two people edit the same record at once.

---

## Design sketch

![Request to response flow sketch — React through service, diff engine and one transaction](./diagrams/request-response.png)

The hand-drawn flow, and it matches the implementation: the transaction opens **first**, the prior
state is read inside it at `SERIALIZABLE`, the diff runs, the record update and audit insert land
together, and a failing audit insert rolls the whole thing back leaving the record unchanged.

The only thing it leaves implicit is the middleware — authentication, the role gate and Zod
validation all run before the service reaches the transaction, and the actor written to the audit
entry comes from there, never from the request body. The sequence below shows that step.

---

## The audited write

`PATCH /api/equipment/:equipmentId/cleaning-records/:recordId`

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant M as Middleware
    participant S as Cleaning service
    participant D as Diff engine
    participant PG as PostgreSQL

    C->>M: PATCH { notes, status } + Bearer token
    M->>M: verify JWT → req.user
    M->>M: requireRole
    M->>M: Zod → req.validatedBody
    Note over M,S: the actor is req.user.<br/>A changedById in the body is ignored.
    M->>S: updateCleaningRecord(ids, input, actor)

    rect rgb(238, 242, 246)
    S->>PG: BEGIN ISOLATION LEVEL SERIALIZABLE
    S->>PG: SELECT record (inside the transaction)
    PG-->>S: before
    S->>S: check record belongs to equipment → 404
    S->>S: buildProposedChange — permission rules<br/>supervisor-only status change, no self-verify
    S->>D: diffFields(before, proposed, ALLOW_LIST)
    D-->>S: change set

    alt change set is empty
        S->>PG: COMMIT
        Note right of S: no audit row written —<br/>a no-op adds nothing to the trail
    else has changes
        S->>S: reason required to amend a VERIFIED record → 400
        S->>PG: UPDATE cleaning_records
        S->>PG: INSERT audit_logs { action, changedById, changes, reason }
        S->>PG: COMMIT
    end
    end

    PG-->>S: ok
    S-->>C: 200 { data: record }
```

**Why the `SELECT` is inside the transaction, at `SERIALIZABLE`.** Under the default
`READ COMMITTED`, two concurrent `PATCH`es could each read the same `before` row and each write an
audit entry claiming the same old value. Nothing would error. The record would end up correct and the
trail would be quietly, plausibly wrong — the worst possible outcome for this system.

**Why one transaction.** If the audit insert fails, the record update must fail too. A change that
lands without a trail entry is an untraceable change. There is an integration test that installs a
temporary trigger to force the audit insert to throw, then asserts the record is unchanged.

---

## Write conflict

What the isolation level buys, and what it costs:

```mermaid
sequenceDiagram
    participant A as Supervisor A
    participant B as Supervisor B
    participant PG as PostgreSQL

    A->>PG: BEGIN SERIALIZABLE, then SELECT
    B->>PG: BEGIN SERIALIZABLE, then SELECT
    Note over A,B: both read status = PENDING
    A->>PG: UPDATE + INSERT audit, then COMMIT
    PG-->>A: 200
    B->>PG: UPDATE + INSERT audit, then COMMIT
    PG-->>B: serialization_failure (40001)
    Note right of PG: Prisma surfaces P2034
    B->>B: error handler → 409 WRITE_CONFLICT
```

Without this, B's audit entry would claim `PENDING → VERIFIED` when A had already made that
transition — a second entry asserting a stale old value.

The cost is real: reduced write throughput and retryable failures for concurrent edits of the *same*
record. For a cleaning log — a handful of writes per record, ever — that is free. **With more time**
the API should retry `P2034` itself once or twice with a short backoff before surfacing the 409;
right now the burden is on the client.

---

## Sign-in

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as Express
    participant PG as PostgreSQL

    C->>API: POST /api/auth/login { email, password }
    API->>PG: SELECT user WHERE email
    alt user found and active
        PG-->>API: user
        API->>API: bcrypt.compare(password, hash)
    else unknown email or deactivated
        PG-->>API: none
        API->>API: bcrypt.compare against a DUMMY hash
        Note right of API: same work, same timing —<br/>otherwise login is an<br/>email-enumeration oracle
    end
    API-->>C: 200 { token, user } — or 401, identical either way
    C->>C: store token (localStorage)
    C->>API: subsequent requests: Authorization: Bearer …
```

An unknown email and a wrong password take the same time and return an identical response. The
identity on later requests is reconstructed from the token's claims rather than re-read from the
database — stateless and cheap, at the cost that a role change does not take effect until the token
expires (8h).

---

## Front-end data flow

```mermaid
flowchart LR
    UI["Component"] --> Q["TanStack Query<br/><i>server state</i>"]
    Q --> AC["api-client<br/><i>one fetch wrapper</i>"]
    AC --> API["API"]
    UI --> F["React Hook Form<br/>+ zodResolver"]
    F -.->|shared schema| AC
    API -.->|"401"| SO["clear token,<br/>end session"]
    Q -.->|"after a mutation"| INV["invalidate: record list,<br/>that record's trail,<br/>global lists, dashboard"]
```

Two things learned the hard way and documented in NOTES.md: a mutation must invalidate the *global*
lists and the dashboard as well as the per-asset ones (otherwise verifying a record leaves three
views showing the pre-write value), and a `401` has to end the session centrally — otherwise an
expired token turns every page into a permanent error state with no way out.
