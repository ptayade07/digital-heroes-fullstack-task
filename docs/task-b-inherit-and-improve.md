# Task B - Inherit And Improve

## Assessment

The inherited codebase is risky because it works by accident rather than by clear contracts. The biggest issues are not equally urgent.

| Issue | Risk If Left Alone | Priority |
| --- | --- | --- |
| Secrets committed to the repo | Immediate credential exposure, account takeover, compliance risk | P0 |
| Direct database calls from the frontend | Data leakage, impossible permission enforcement, brittle client code | P0 |
| No tests around revenue-critical flows | Every release risks breaking login, lead capture, checkout, or reporting | P1 |
| Business logic inside route handlers | Duplicate rules, inconsistent behavior, hard debugging | P1 |
| No release gates or rollback path | A bad deploy can stay live too long | P1 |
| Weak observability | Failures are discovered by customers first | P2 |

The order matters: first stop active security exposure, then put guardrails around production, then refactor behind tests.

## Migration Plan

### Week 1

- Rotate exposed secrets and remove them from history where practical.
- Move secrets into environment variables on the host.
- Add a thin backend API in front of direct database operations.
- Add smoke tests for login, lead capture, lead update, and admin/member permissions.
- Add basic request logging and error tracking.
- Create a rollback runbook and identify the last known good deploy.

### Month 1

- Move business rules from route handlers into service modules.
- Add integration tests around permission boundaries and data validation.
- Replace frontend database calls with API calls.
- Add CI gates for tests, linting, and secret scanning.
- Introduce consistent API error shapes and status codes.

### Quarter 1

- Normalize the data model around users, roles, leads, notes, and activities.
- Add audit logging for sensitive actions.
- Introduce performance budgets and production dashboards.
- Document engineering standards and require them for new code.
- Pay down the oldest risky route handlers one workflow at a time.

## Before And After Refactor

### Before

```js
app.post("/lead/update", async (req, res) => {
  const lead = await db.query("select * from leads where id = " + req.body.id);
  if (req.body.status) {
    await db.query("update leads set status = '" + req.body.status + "' where id = " + req.body.id);
  }
  if (req.body.note) {
    await db.query("insert into notes values ('" + req.body.id + "','" + req.body.note + "')");
  }
  res.send({ ok: true });
});
```

Problems: SQL injection risk, no authentication, no authorization, no validation, mixed responsibilities, no activity trail, and no meaningful error responses.

### After

```js
app.patch("/api/leads/:id", requireAuth, async (req, res) => {
  const lead = await leadRepository.findById(req.params.id);
  if (!lead) return res.status(404).json(error("not_found", "Lead not found"));
  if (!permissions.canUpdateLead(req.user, lead)) {
    return res.status(403).json(error("forbidden", "You cannot update this lead"));
  }

  const result = validateLeadPatch(req.body);
  if (!result.ok) {
    return res.status(422).json(error("validation_error", "Invalid lead update", result.details));
  }

  const updated = await leadService.updateLead({
    lead,
    patch: result.patch,
    actorId: req.user.id
  });

  res.json({ data: updated });
});
```

What improved: the route now coordinates the request rather than owning every concern. Validation, permissions, persistence, and business behavior are testable separately.

## Engineering Standards Proposal

- All secrets live in environment variables or the deployment secret manager.
- Every API route must define auth requirements, validation, status codes, and error shape.
- Business logic belongs in service modules, not route handlers or frontend components.
- Frontend code must never connect directly to the database.
- Every bug fix that affects customer behavior gets a regression test.
- Pull requests require one reviewer and a short risk note.
- CI must pass before merge.

## Adoption Plan

I would not introduce all standards as a lecture. I would pick one painful workflow, improve it, and make the benefit obvious. The first target would be lead updates because it touches permissions, customer data, and sales operations.

The rollout:

1. Pair with one engineer on the first refactor.
2. Ship it behind tests without changing the user-facing behavior.
3. Use that PR as the reference example.
4. Add the standards to the pull request template.
5. Track adoption through review comments, escaped bugs, and deploy rollbacks.

Resistance usually drops when the standard saves time in the next incident. The goal is not process for its own sake; it is fewer surprises in production.
