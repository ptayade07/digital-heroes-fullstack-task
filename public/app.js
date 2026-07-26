let currentUser = null;
let statuses = [];
let users = [];
let selectedLeadId = null;

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.details?.join(", ") || payload.error?.message || "Request failed");
  }
  return payload;
}

function showAuthedState(isAuthed) {
  $("#login-view").classList.toggle("hidden", isAuthed);
  $("#dashboard-view").classList.toggle("hidden", !isAuthed);
  $("#logout-button").classList.toggle("hidden", !isAuthed);
}

function statusLabel(value) {
  return value.replace(/_/g, " ");
}

function renderStatusOptions() {
  const filter = $("#filters select[name='status']");
  filter.innerHTML = '<option value="">All statuses</option>';
  for (const status of statuses) {
    filter.insertAdjacentHTML("beforeend", `<option value="${status}">${statusLabel(status)}</option>`);
  }
}

function renderLeads(result) {
  $("#lead-count").textContent = `${result.total} lead${result.total === 1 ? "" : "s"}`;
  const list = $("#lead-list");
  list.innerHTML = "";
  if (!result.data.length) {
    list.innerHTML = '<p class="empty-state">No leads match this view.</p>';
    return;
  }
  for (const lead of result.data) {
    const active = lead.id === selectedLeadId ? " active" : "";
    list.insertAdjacentHTML(
      "beforeend",
      `<button class="lead-row${active}" type="button" data-id="${lead.id}">
        <span>
          <strong>${lead.company}</strong>
          <small>${lead.name} - ${lead.email}</small>
        </span>
        <span class="status">${statusLabel(lead.status)}</span>
      </button>`
    );
  }
}

function assignedName(id) {
  if (!id) return "Unassigned";
  return users.find((user) => user.id === id)?.name || id;
}

function renderLeadDetail(lead) {
  const canAssign = currentUser.role === "admin";
  const userOptions = [`<option value="">Unassigned</option>`]
    .concat(users.map((user) => `<option value="${user.id}" ${lead.assignedTo === user.id ? "selected" : ""}>${user.name}</option>`))
    .join("");
  const statusOptions = statuses
    .map((status) => `<option value="${status}" ${lead.status === status ? "selected" : ""}>${statusLabel(status)}</option>`)
    .join("");

  $("#lead-detail").className = "";
  $("#lead-detail").innerHTML = `
    <div class="section-head">
      <div>
        <h2>${lead.company}</h2>
        <p class="muted">${lead.name} - ${lead.email}</p>
      </div>
      <span class="status large">${statusLabel(lead.status)}</span>
    </div>
    <p>${lead.message}</p>
    <form id="lead-update" class="inline-form">
      <label>
        Status
        <select name="status">${statusOptions}</select>
      </label>
      <label>
        Owner
        <select name="assignedTo" ${canAssign ? "" : "disabled"}>${userOptions}</select>
      </label>
      <button type="submit">Save</button>
    </form>
    <form id="note-form" class="note-form">
      <label>
        Add note
        <textarea name="body" rows="3" required></textarea>
      </label>
      <button type="submit">Add note</button>
    </form>
    <div class="two-column">
      <section>
        <h3>Notes</h3>
        ${lead.notes.length ? lead.notes.map((note) => `<article class="timeline-item"><p>${note.body}</p><small>${new Date(note.createdAt).toLocaleString()}</small></article>`).join("") : '<p class="muted">No notes yet.</p>'}
      </section>
      <section>
        <h3>Activity</h3>
        ${lead.activity.map((item) => `<article class="timeline-item"><p>${item.detail}</p><small>${item.type} - ${new Date(item.createdAt).toLocaleString()}</small></article>`).join("")}
      </section>
    </div>
  `;
}

async function loadLeads() {
  const params = new URLSearchParams(new FormData($("#filters")));
  const result = await api(`/api/leads?${params}`);
  renderLeads(result);
}

async function loadLead(id) {
  selectedLeadId = id;
  const { data } = await api(`/api/leads/${id}`);
  renderLeadDetail(data);
  await loadLeads();
}

async function bootstrap() {
  try {
    const [{ user }, meta] = await Promise.all([api("/api/me"), api("/api/meta")]);
    currentUser = user;
    statuses = meta.statuses;
    $("#user-chip").textContent = `${user.name} - ${user.role}`;
    showAuthedState(true);
    renderStatusOptions();
    if (user.role === "admin") {
      const response = await api("/api/users");
      users = response.data;
    } else {
      users = [user];
    }
    await loadLeads();
  } catch {
    showAuthedState(false);
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-message").textContent = "Signing in...";
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
    });
    $("#login-message").textContent = "";
    await bootstrap();
  } catch (error) {
    $("#login-message").textContent = error.message;
  }
});

$("#logout-button").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  currentUser = null;
  selectedLeadId = null;
  showAuthedState(false);
});

$("#filters").addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadLeads();
});

$("#lead-list").addEventListener("click", async (event) => {
  const row = event.target.closest("[data-id]");
  if (row) await loadLead(row.dataset.id);
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "lead-update") {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.target));
    payload.assignedTo = payload.assignedTo || null;
    await api(`/api/leads/${selectedLeadId}`, { method: "PATCH", body: JSON.stringify(payload) });
    await loadLead(selectedLeadId);
  }
  if (event.target.id === "note-form") {
    event.preventDefault();
    await api(`/api/leads/${selectedLeadId}/notes`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.target)))
    });
    await loadLead(selectedLeadId);
  }
});

bootstrap();
