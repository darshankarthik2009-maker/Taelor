/* Taelor — Garment Management System */
(() => {
  const API = "/api";
  const SESSION_KEY = "taelor_session_v1";

  const SECTORS = [
    "Cutting",
    "Stitching",
    "Overlock",
    "Ironing",
    "Packing",
    "Quality Check",
    "Finishing",
  ];

  const LOAD_STATUSES = ["Pending", "In progress", "Ready", "Delayed", "Completed"];
  const LOAD_CONDITIONS = ["Good", "Damaged", "Needs rework", "Hold"];

  const defaultState = () => ({
    users: [],
    session: null, // kept in localStorage, not on the shared server file
    goods: [],
    revenue: [],
    loans: [],
    workers: [],
    payroll: [],
    targets: [],
    attendance: [],
    workerProfiles: {}, // email -> profile
  });

  function readLocalSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeLocalSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function loadFromServer() {
    try {
      const res = await fetch(`${API}/state`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load state");
      const data = { ...defaultState(), ...(await res.json()) };
      data.session = readLocalSession();
      // Drop session if that user no longer exists on the server
      if (data.session?.email && !(data.users || []).some((u) => u.email === data.session.email)) {
        data.session = null;
        writeLocalSession(null);
      }
      return data;
    } catch (err) {
      console.error(err);
      toast("Backend unreachable — open http://localhost:3000 after npm start", true);
      return { ...defaultState(), session: readLocalSession() };
    }
  }

  function save() {
    const payload = { ...state };
    delete payload.session; // session is browser-only
    delete payload.users; // users/passwords stay on the server
    fetch(`${API}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Save failed");
        }
      })
      .catch((err) => toast(err.message || "Could not save to server.", true));
  }

  let state = defaultState();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function uid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(d = new Date()) {
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function inr(n) {
    const v = Number(n) || 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(v);
  }

  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  function showView(id) {
    ["view-auth", "view-role", "view-management", "view-worker"].forEach((v) => {
      $(`#${v}`).classList.toggle("hidden", v !== id);
    });
  }

  function currentUser() {
    if (!state.session) return null;
    return state.users.find((u) => u.email === state.session.email) || state.session;
  }

  /* ——— Auth ——— */
  function setupAuth() {
    $$("[data-auth-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$("[data-auth-tab]").forEach((t) => t.classList.toggle("active", t === tab));
        const mode = tab.dataset.authTab;
        $("#form-login").classList.toggle("hidden", mode !== "login");
        $("#form-signup").classList.toggle("hidden", mode !== "signup");
        $("#auth-title").textContent = mode === "login" ? "Welcome back" : "Create account";
        $("#auth-sub").textContent =
          mode === "login"
            ? "Sign in to manage production or check your worker portal."
            : "Register once — then use Management or Worker side.";
        $("#auth-error").classList.add("hidden");
      });
    });

    $("#form-login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#login-email").value.trim().toLowerCase();
      const password = $("#login-password").value;
      try {
        const res = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          showAuthError(data.error || "Invalid email or password.");
          return;
        }
        state = await loadFromServer();
        state.session = data.session;
        save();
        enterApp();
      } catch {
        showAuthError("Cannot reach server. Run npm start first.");
      }
    });

    $("#form-signup").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#signup-name").value.trim();
      const email = $("#signup-email").value.trim().toLowerCase();
      const password = $("#signup-password").value;
      const role = $("#signup-role").value;
      try {
        const res = await fetch(`${API}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, role }),
        });
        const data = await res.json();
        if (!res.ok) {
          showAuthError(data.error || "Could not create account.");
          return;
        }
        state = await loadFromServer();
        state.session = data.session;
        save();
        toast("Account created.");
        enterApp();
      } catch {
        showAuthError("Cannot reach server. Run npm start first.");
      }
    });
  }

  function showAuthError(msg) {
    const el = $("#auth-error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function enterApp() {
    const user = currentUser();
    if (!user) {
      showView("view-auth");
      return;
    }
    $("#role-user-name").textContent = user.name;
    showView("view-role");
  }

  function logout() {
    state.session = null;
    save();
    fetch(`${API}/auth/logout`, { method: "POST" }).catch(() => {});
    showView("view-auth");
  }

  /* ——— Management pages ——— */
  const mgmtTitles = {
    overview: "Overview",
    goods: "Goods tracking",
    revenue: "Revenue",
    workers: "Worker details",
    cashier: "Cashier",
    targets: "Company target",
  };

  function openManagement(section = "overview") {
    const user = currentUser();
    $("#mgmt-user-label").textContent = user?.name || "Online";
    $("#mgmt-date").textContent = formatDate();
    showView("view-management");
    setMgmtSection(section);
  }

  function setMgmtSection(section) {
    $$("#mgmt-nav .nav-item").forEach((b) =>
      b.classList.toggle("active", b.dataset.mgmt === section)
    );
    $("#mgmt-page-label").textContent = mgmtTitles[section] || section;
    const page = $("#mgmt-page");
    const renderers = {
      overview: renderOverview,
      goods: renderGoods,
      revenue: renderRevenue,
      workers: renderWorkers,
      cashier: renderCashier,
      targets: renderTargets,
    };
    page.innerHTML = "";
    (renderers[section] || renderOverview)(page);
  }

  function renderOverview(root) {
    const inPieces = state.goods.reduce((s, g) => s + (Number(g.inputPieces) || 0), 0);
    const outPieces = state.goods.reduce((s, g) => s + (Number(g.outputPieces) || 0), 0);
    const income = state.revenue.reduce((s, r) => s + (Number(r.income) || 0), 0);
    const expense = state.revenue.reduce((s, r) => s + (Number(r.expense) || 0), 0);
    const profit = income - expense;
    const activeWorkers = state.workers.length;
    const openTargets = state.targets.filter((t) => t.status !== "Completed").length;

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Factory snapshot</div>
          <h1>Garment management overview</h1>
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric-cell"><div class="metric-label">Pieces in</div><div class="metric-value">${inPieces}<span>PCS</span></div></div>
        <div class="metric-cell"><div class="metric-label">Pieces out</div><div class="metric-value">${outPieces}<span>PCS</span></div></div>
        <div class="metric-cell amber"><div class="metric-label">Net revenue</div><div class="metric-value ${profit >= 0 ? "profit" : "loss"}">${inr(profit)}</div></div>
        <div class="metric-cell"><div class="metric-label">Workers</div><div class="metric-value">${activeWorkers}<span>REG</span></div></div>
        <div class="metric-cell amber"><div class="metric-label">Open targets</div><div class="metric-value">${openTargets}<span>GOALS</span></div></div>
      </div>
      <div class="split-2">
        <div class="panel">
          <div class="panel-head"><h2>Recent loads</h2></div>
          ${
            state.goods.length
              ? `<div class="table-wrap"><table class="data"><thead><tr><th>Load</th><th>In</th><th>Out</th><th>Status</th><th>Deadline</th></tr></thead>
              <tbody>${state.goods
                .slice(-6)
                .reverse()
                .map(
                  (g) => `<tr>
                  <td><strong>${escapeHtml(g.name)}</strong></td>
                  <td>${g.inputPieces}</td>
                  <td>${g.outputPieces}</td>
                  <td>${statusBadge(g.status)}</td>
                  <td>${g.deadline || "—"}</td>
                </tr>`
                )
                .join("")}</tbody></table></div>`
              : `<div class="empty"><strong>No loads yet</strong><span>Add goods under Goods tracking.</span></div>`
          }
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Team</h2></div>
          <div class="list-rows">
            ${
              state.workers.length
                ? state.workers
                    .slice(0, 6)
                    .map(
                      (w) => `<div class="list-row">
                      <div class="avatar">${initials(w.name)}</div>
                      <div class="list-meta"><strong>${escapeHtml(w.name)}</strong><span>${escapeHtml(w.sector)} · ${w.phone}</span></div>
                    </div>`
                    )
                    .join("")
                : `<div class="empty"><strong>No workers registered</strong><span>Add them in Worker details.</span></div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderGoods(root) {
    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Production floor</div>
          <h1>Tracking of goods</h1>
        </div>
      </div>
      <form class="form-panel" id="form-goods">
        <div class="form-title" style="font-weight:650;font-size:0.85rem">Add weekly load</div>
        <div class="form-grid four">
          <div class="field"><label>Load / batch name</label><input name="name" required placeholder="Batch A — shirts" /></div>
          <div class="field"><label>Input pieces (came in)</label><input name="inputPieces" type="number" min="0" required /></div>
          <div class="field"><label>Output pieces (gone out)</label><input name="outputPieces" type="number" min="0" required /></div>
          <div class="field"><label>Week of</label><input name="weekOf" type="date" value="${todayISO()}" required /></div>
          <div class="field"><label>Target pieces</label><input name="target" type="number" min="0" required /></div>
          <div class="field"><label>Deadline</label><input name="deadline" type="date" required /></div>
          <div class="field"><label>Status</label><select name="status">${LOAD_STATUSES.map((s) => `<option>${s}</option>`).join("")}</select></div>
          <div class="field"><label>Condition</label><select name="condition">${LOAD_CONDITIONS.map((s) => `<option>${s}</option>`).join("")}</select></div>
        </div>
        <div class="form-actions">
          <span>Pieces in / out for this week · target &amp; load condition</span>
          <button class="btn btn-primary" type="submit">Save load</button>
        </div>
      </form>
      ${goodsSummary()}
      <div class="panel">
        <div class="panel-head"><h2>All loads</h2></div>
        ${
          state.goods.length
            ? `<div class="table-wrap"><table class="data"><thead><tr>
                <th>Load</th><th>Week</th><th>In</th><th>Out</th><th>Target</th><th>Deadline</th><th>Status</th><th>Condition</th><th></th>
              </tr></thead><tbody>
              ${state.goods
                .slice()
                .reverse()
                .map(
                  (g) => `<tr>
                  <td><strong>${escapeHtml(g.name)}</strong></td>
                  <td>${g.weekOf || "—"}</td>
                  <td>${g.inputPieces}</td>
                  <td>${g.outputPieces}</td>
                  <td>${g.target}</td>
                  <td>${g.deadline || "—"}</td>
                  <td>${statusBadge(g.status)}</td>
                  <td>${conditionBadge(g.condition)}</td>
                  <td><button type="button" class="action-link danger" data-del-good="${g.id}">Delete</button></td>
                </tr>`
                )
                .join("")}
              </tbody></table></div>`
            : `<div class="empty"><strong>No goods recorded</strong><span>Enter this week's input and output above.</span></div>`
        }
      </div>
    `;

    $("#form-goods", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.goods.push({
        id: uid(),
        name: String(fd.get("name")).trim(),
        inputPieces: Number(fd.get("inputPieces")),
        outputPieces: Number(fd.get("outputPieces")),
        weekOf: String(fd.get("weekOf")),
        target: Number(fd.get("target")),
        deadline: String(fd.get("deadline")),
        status: String(fd.get("status")),
        condition: String(fd.get("condition")),
      });
      save();
      toast("Load saved.");
      setMgmtSection("goods");
    });

    $$("[data-del-good]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.goods = state.goods.filter((g) => g.id !== btn.dataset.delGood);
        save();
        toast("Load removed.");
        setMgmtSection("goods");
      });
    });
  }

  function goodsSummary() {
    const inP = state.goods.reduce((s, g) => s + (Number(g.inputPieces) || 0), 0);
    const outP = state.goods.reduce((s, g) => s + (Number(g.outputPieces) || 0), 0);
    const tgt = state.goods.reduce((s, g) => s + (Number(g.target) || 0), 0);
    return `<div class="summary-strip">
      <div><span>Total pieces in</span><strong>${inP}</strong></div>
      <div><span>Total pieces out</span><strong>${outP}</strong></div>
      <div><span>Combined targets</span><strong>${tgt}</strong></div>
    </div>`;
  }

  function renderRevenue(root) {
    const income = state.revenue.reduce((s, r) => s + (Number(r.income) || 0), 0);
    const expense = state.revenue.reduce((s, r) => s + (Number(r.expense) || 0), 0);
    const loanTotal = state.loans.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const net = income - expense;
    const status =
      net > 0 ? `<span class="profit">Profit</span>` : net < 0 ? `<span class="loss">Loss</span>` : `<span class="badge badge-muted">Break-even</span>`;

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Money flow</div>
          <h1>Revenue &amp; loans</h1>
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric-cell"><div class="metric-label">Income (₹)</div><div class="metric-value">${inr(income)}</div></div>
        <div class="metric-cell"><div class="metric-label">Expense / output (₹)</div><div class="metric-value">${inr(expense)}</div></div>
        <div class="metric-cell amber"><div class="metric-label">Profit / loss</div><div class="metric-value">${inr(net)}</div></div>
        <div class="metric-cell"><div class="metric-label">Status</div><div class="metric-value" style="font-size:1.1rem">${status}</div></div>
        <div class="metric-cell amber"><div class="metric-label">Company loans</div><div class="metric-value">${inr(loanTotal)}</div></div>
      </div>

      <div class="split-2">
        <div>
          <form class="form-panel" id="form-revenue">
            <div style="font-weight:650;font-size:0.85rem">Record income &amp; expense</div>
            <div class="form-grid two">
              <div class="field"><label>Date</label><input name="date" type="date" value="${todayISO()}" required /></div>
              <div class="field"><label>Note</label><input name="note" placeholder="Order payment / fabric cost" /></div>
              <div class="field"><label>Income (₹ input)</label><input name="income" type="number" min="0" value="0" required /></div>
              <div class="field"><label>Expense (₹ output)</label><input name="expense" type="number" min="0" value="0" required /></div>
            </div>
            <div class="form-actions">
              <span>Used for profit / loss status</span>
              <button class="btn btn-primary" type="submit">Save entry</button>
            </div>
          </form>
          <div class="panel">
            <div class="panel-head"><h2>Revenue entries</h2></div>
            ${
              state.revenue.length
                ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Note</th><th>Income</th><th>Expense</th><th></th></tr></thead>
                <tbody>${state.revenue
                  .slice()
                  .reverse()
                  .map(
                    (r) => `<tr>
                    <td>${r.date}</td>
                    <td>${escapeHtml(r.note || "—")}</td>
                    <td>${inr(r.income)}</td>
                    <td>${inr(r.expense)}</td>
                    <td><button type="button" class="action-link danger" data-del-rev="${r.id}">Delete</button></td>
                  </tr>`
                  )
                  .join("")}</tbody></table></div>`
                : `<div class="empty"><strong>No revenue yet</strong></div>`
            }
          </div>
        </div>
        <div>
          <form class="form-panel" id="form-loan">
            <div style="font-weight:650;font-size:0.85rem">Track company loan</div>
            <div class="form-grid" style="grid-template-columns:1fr">
              <div class="field"><label>Lender / bank</label><input name="lender" required placeholder="SBI / Owner" /></div>
              <div class="field"><label>Amount (₹)</label><input name="amount" type="number" min="0" required /></div>
              <div class="field"><label>Due date</label><input name="due" type="date" /></div>
              <div class="field"><label>Notes</label><textarea name="notes" placeholder="Interest, terms…"></textarea></div>
            </div>
            <div class="form-actions">
              <span>Loan book</span>
              <button class="btn btn-primary" type="submit">Add loan</button>
            </div>
          </form>
          <div class="panel">
            <div class="panel-head"><h2>Loans</h2></div>
            <div class="list-rows">
              ${
                state.loans.length
                  ? state.loans
                      .map(
                        (l) => `<div class="list-row">
                        <div class="list-meta"><strong>${escapeHtml(l.lender)}</strong><span>${l.due ? `Due ${l.due}` : "No due date"} · ${escapeHtml(l.notes || "")}</span></div>
                        <div class="list-right">${inr(l.amount)}
                          <button type="button" class="action-link danger" data-del-loan="${l.id}" style="margin-left:8px">×</button>
                        </div>
                      </div>`
                      )
                      .join("")
                  : `<div class="empty"><strong>No loans tracked</strong></div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;

    $("#form-revenue", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.revenue.push({
        id: uid(),
        date: String(fd.get("date")),
        note: String(fd.get("note") || "").trim(),
        income: Number(fd.get("income")),
        expense: Number(fd.get("expense")),
      });
      save();
      toast("Revenue entry saved.");
      setMgmtSection("revenue");
    });

    $("#form-loan", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.loans.push({
        id: uid(),
        lender: String(fd.get("lender")).trim(),
        amount: Number(fd.get("amount")),
        due: String(fd.get("due") || ""),
        notes: String(fd.get("notes") || "").trim(),
      });
      save();
      toast("Loan added.");
      setMgmtSection("revenue");
    });

    $$("[data-del-rev]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.revenue = state.revenue.filter((r) => r.id !== btn.dataset.delRev);
        save();
        setMgmtSection("revenue");
      });
    });
    $$("[data-del-loan]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.loans = state.loans.filter((l) => l.id !== btn.dataset.delLoan);
        save();
        setMgmtSection("revenue");
      });
    });
  }

  function renderWorkers(root) {
    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Company database</div>
          <h1>Worker details</h1>
        </div>
      </div>
      <form class="form-panel" id="form-worker">
        <div style="font-weight:650;font-size:0.85rem">Register a worker</div>
        <div class="form-grid">
          <div class="field"><label>Name</label><input name="name" required /></div>
          <div class="field"><label>Age</label><input name="age" type="number" min="14" max="80" required /></div>
          <div class="field"><label>Phone number</label><input name="phone" required placeholder="10-digit" /></div>
          <div class="field"><label>Working sector</label>
            <select name="sector">${SECTORS.map((s) => `<option>${s}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Daily rate (₹)</label><input name="dailyRate" type="number" min="0" value="500" required /></div>
          <div class="field"><label>Join date</label><input name="joinDate" type="date" value="${todayISO()}" /></div>
        </div>
        <div class="field"><label>Other details</label><textarea name="details" placeholder="Skills, ID proof, address…"></textarea></div>
        <div class="form-actions">
          <span>${state.workers.length} workers in database</span>
          <button class="btn btn-primary" type="submit">Register worker</button>
        </div>
      </form>
      <div class="panel">
        <div class="panel-head"><h2>Registered workers</h2></div>
        ${
          state.workers.length
            ? `<div class="table-wrap"><table class="data"><thead><tr>
                <th>Name</th><th>Age</th><th>Phone</th><th>Sector</th><th>Daily rate</th><th>Details</th><th></th>
              </tr></thead><tbody>
              ${state.workers
                .map(
                  (w) => `<tr>
                  <td><strong>${escapeHtml(w.name)}</strong></td>
                  <td>${w.age}</td>
                  <td>${escapeHtml(w.phone)}</td>
                  <td>${escapeHtml(w.sector)}</td>
                  <td>${inr(w.dailyRate)}</td>
                  <td>${escapeHtml(w.details || "—")}</td>
                  <td><button type="button" class="action-link danger" data-del-worker="${w.id}">Remove</button></td>
                </tr>`
                )
                .join("")}
              </tbody></table></div>`
            : `<div class="empty"><strong>No workers yet</strong><span>Register each worker for the company database.</span></div>`
        }
      </div>
    `;

    $("#form-worker", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.workers.push({
        id: uid(),
        name: String(fd.get("name")).trim(),
        age: Number(fd.get("age")),
        phone: String(fd.get("phone")).trim(),
        sector: String(fd.get("sector")),
        dailyRate: Number(fd.get("dailyRate")),
        joinDate: String(fd.get("joinDate") || ""),
        details: String(fd.get("details") || "").trim(),
      });
      save();
      toast("Worker registered.");
      setMgmtSection("workers");
    });

    $$("[data-del-worker]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.workers = state.workers.filter((w) => w.id !== btn.dataset.delWorker);
        save();
        setMgmtSection("workers");
      });
    });
  }

  function renderCashier(root) {
    const income = state.revenue.reduce((s, r) => s + (Number(r.income) || 0), 0);
    const expense = state.revenue.reduce((s, r) => s + (Number(r.expense) || 0), 0);
    const companyPool = Math.max(0, income - expense);

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Payroll</div>
          <h1>Cashier — salary calculation</h1>
        </div>
      </div>
      <div class="summary-strip">
        <div><span>Company income</span><strong>${inr(income)}</strong></div>
        <div><span>Expenses</span><strong>${inr(expense)}</strong></div>
        <div><span>Available pool</span><strong>${inr(companyPool)}</strong></div>
      </div>
      <form class="form-panel" id="form-payroll">
        <div style="font-weight:650;font-size:0.85rem">Calculate worker salary from company income</div>
        <div class="form-grid">
          <div class="field"><label>Worker</label>
            <select name="workerId" required>
              <option value="">Select worker</option>
              ${state.workers.map((w) => `<option value="${w.id}">${escapeHtml(w.name)} — ${escapeHtml(w.sector)} (${inr(w.dailyRate)}/day)</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Days worked</label><input name="days" type="number" min="0" max="31" value="26" required /></div>
          <div class="field"><label>Bonus / overtime (₹)</label><input name="bonus" type="number" min="0" value="0" /></div>
          <div class="field"><label>Deductions (₹)</label><input name="deductions" type="number" min="0" value="0" /></div>
          <div class="field"><label>Period</label><input name="period" type="month" value="${todayISO().slice(0, 7)}" required /></div>
        </div>
        <div class="form-actions">
          <span>Salary = (daily rate × days) + bonus − deductions</span>
          <button class="btn btn-primary" type="submit" ${state.workers.length ? "" : "disabled"}>Calculate &amp; save</button>
        </div>
      </form>
      <div class="panel">
        <div class="panel-head"><h2>Payroll records</h2></div>
        ${
          state.payroll.length
            ? `<div class="table-wrap"><table class="data"><thead><tr>
                <th>Worker</th><th>Period</th><th>Days</th><th>Gross</th><th>Net</th><th>% of pool</th><th></th>
              </tr></thead><tbody>
              ${state.payroll
                .slice()
                .reverse()
                .map((p) => {
                  const pct = companyPool ? Math.round((p.net / companyPool) * 100) : 0;
                  return `<tr>
                    <td><strong>${escapeHtml(p.workerName)}</strong></td>
                    <td>${p.period}</td>
                    <td>${p.days}</td>
                    <td>${inr(p.gross)}</td>
                    <td>${inr(p.net)}</td>
                    <td>${pct}%</td>
                    <td><button type="button" class="action-link danger" data-del-pay="${p.id}">Delete</button></td>
                  </tr>`;
                })
                .join("")}
              </tbody></table></div>`
            : `<div class="empty"><strong>No payroll yet</strong><span>Register workers first, then calculate salaries.</span></div>`
        }
      </div>
    `;

    $("#form-payroll", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const worker = state.workers.find((w) => w.id === fd.get("workerId"));
      if (!worker) return;
      const days = Number(fd.get("days"));
      const bonus = Number(fd.get("bonus") || 0);
      const deductions = Number(fd.get("deductions") || 0);
      const gross = worker.dailyRate * days + bonus;
      const net = Math.max(0, gross - deductions);
      state.payroll.push({
        id: uid(),
        workerId: worker.id,
        workerName: worker.name,
        period: String(fd.get("period")),
        days,
        bonus,
        deductions,
        gross,
        net,
        createdAt: todayISO(),
      });
      save();
      toast(`Salary for ${worker.name}: ${inr(net)}`);
      setMgmtSection("cashier");
    });

    $$("[data-del-pay]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.payroll = state.payroll.filter((p) => p.id !== btn.dataset.delPay);
        save();
        setMgmtSection("cashier");
      });
    });
  }

  function renderTargets(root) {
    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Growth path</div>
          <h1>Company targets</h1>
        </div>
      </div>
      <form class="form-panel" id="form-target">
        <div style="font-weight:650;font-size:0.85rem">Set a business goal</div>
        <div class="form-grid">
          <div class="field"><label>Goal title</label><input name="title" required placeholder="Reach 10,000 pieces / month" /></div>
          <div class="field"><label>Level</label>
            <select name="level">
              <option>Level 1</option><option>Level 2</option><option>Level 3</option><option>Level 4</option><option>Level 5</option>
            </select>
          </div>
          <div class="field"><label>Deadline</label><input name="deadline" type="date" required /></div>
          <div class="field"><label>Target value</label><input name="value" placeholder="e.g. 10000 pcs / ₹5L" /></div>
          <div class="field"><label>Status</label>
            <select name="status"><option>Not started</option><option>In progress</option><option>Completed</option></select>
          </div>
        </div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="What unlocks the next level…"></textarea></div>
        <div class="form-actions">
          <span>Complete goals to move to the next business level</span>
          <button class="btn btn-primary" type="submit">Add target</button>
        </div>
      </form>
      <div class="panel">
        <div class="panel-head"><h2>Goals</h2></div>
        ${
          state.targets.length
            ? `<div class="list-rows">${state.targets
                .map((t) => {
                  const badge =
                    t.status === "Completed"
                      ? "badge-ok"
                      : t.status === "In progress"
                        ? "badge-warn"
                        : "badge-muted";
                  return `<div class="list-row">
                    <div class="list-meta">
                      <strong>${escapeHtml(t.level)} · ${escapeHtml(t.title)}</strong>
                      <span>Due ${t.deadline}${t.value ? ` · ${escapeHtml(t.value)}` : ""}${t.notes ? ` · ${escapeHtml(t.notes)}` : ""}</span>
                    </div>
                    <span class="badge ${badge}">${escapeHtml(t.status)}</span>
                    <button type="button" class="action-link" data-complete-target="${t.id}" ${t.status === "Completed" ? "disabled" : ""}>Mark done</button>
                    <button type="button" class="action-link danger" data-del-target="${t.id}">Delete</button>
                  </div>`;
                })
                .join("")}</div>`
            : `<div class="empty"><strong>No targets set</strong><span>Add goals so the business can move to the next level.</span></div>`
        }
      </div>
    `;

    $("#form-target", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.targets.push({
        id: uid(),
        title: String(fd.get("title")).trim(),
        level: String(fd.get("level")),
        deadline: String(fd.get("deadline")),
        value: String(fd.get("value") || "").trim(),
        status: String(fd.get("status")),
        notes: String(fd.get("notes") || "").trim(),
      });
      save();
      toast("Target added.");
      setMgmtSection("targets");
    });

    $$("[data-complete-target]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = state.targets.find((x) => x.id === btn.dataset.completeTarget);
        if (t) t.status = "Completed";
        save();
        toast("Goal completed — ready for the next level.");
        setMgmtSection("targets");
      });
    });

    $$("[data-del-target]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.targets = state.targets.filter((t) => t.id !== btn.dataset.delTarget);
        save();
        setMgmtSection("targets");
      });
    });
  }

  /* ——— Worker portal ——— */
  const workerTitles = {
    register: "Register",
    sector: "Sector",
    time: "Time management",
    salary: "Salary",
  };

  function workerProfile() {
    const email = state.session?.email;
    if (!email) return null;
    return state.workerProfiles[email] || null;
  }

  function openWorker(section = "register") {
    const user = currentUser();
    $("#worker-user-label").textContent = user?.name || "Online";
    $("#worker-date").textContent = formatDate();
    showView("view-worker");
    const profile = workerProfile();
    setWorkerSection(profile ? section : "register");
  }

  function setWorkerSection(section) {
    $$("#worker-nav .nav-item").forEach((b) =>
      b.classList.toggle("active", b.dataset.worker === section)
    );
    $("#worker-page-label").textContent = workerTitles[section] || section;
    const page = $("#worker-page");
    page.innerHTML = "";
    const map = {
      register: renderWorkerRegister,
      sector: renderWorkerSector,
      time: renderWorkerTime,
      salary: renderWorkerSalary,
    };
    (map[section] || renderWorkerRegister)(page);
  }

  function renderWorkerRegister(root) {
    const profile = workerProfile();
    const user = currentUser();

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Worker portal</div>
          <h1>${profile ? "Your registration" : "Register as worker"}</h1>
        </div>
      </div>
      ${
        profile
          ? `<div class="worker-reg-banner">You are registered. Update details below if needed, then use Sector, Time, and Salary.</div>`
          : `<div class="worker-reg-banner">Complete registration before using sector, attendance, and salary tools.</div>`
      }
      <form class="form-panel" id="form-wreg">
        <div class="form-grid">
          <div class="field"><label>Full name</label><input name="name" required value="${escapeAttr(profile?.name || user?.name || "")}" /></div>
          <div class="field"><label>Age</label><input name="age" type="number" min="14" max="80" required value="${profile?.age || ""}" /></div>
          <div class="field"><label>Phone</label><input name="phone" required value="${escapeAttr(profile?.phone || "")}" /></div>
          <div class="field"><label>Sector</label>
            <select name="sector">${SECTORS.map((s) => `<option ${profile?.sector === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Expected daily rate (₹)</label><input name="dailyRate" type="number" min="0" value="${profile?.dailyRate || 500}" required /></div>
        </div>
        <div class="field"><label>Additional details</label><textarea name="details">${escapeHtml(profile?.details || "")}</textarea></div>
        <div class="form-actions">
          <span>Saved to your worker profile</span>
          <button class="btn btn-primary" type="submit">${profile ? "Update profile" : "Register"}</button>
        </div>
      </form>
    `;

    $("#form-wreg", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const email = state.session.email;
      const fd = new FormData(e.target);
      const data = {
        name: String(fd.get("name")).trim(),
        age: Number(fd.get("age")),
        phone: String(fd.get("phone")).trim(),
        sector: String(fd.get("sector")),
        dailyRate: Number(fd.get("dailyRate")),
        details: String(fd.get("details") || "").trim(),
        updatedAt: todayISO(),
      };
      state.workerProfiles[email] = data;

      // Mirror into company worker DB if not already present by phone
      if (!state.workers.some((w) => w.phone === data.phone)) {
        state.workers.push({
          id: uid(),
          ...data,
          joinDate: todayISO(),
        });
      }
      save();
      toast("Worker registration saved.");
      setWorkerSection("sector");
    });
  }

  function renderWorkerSector(root) {
    const profile = workerProfile();
    if (!profile) {
      root.innerHTML = needRegister();
      return;
    }

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Floor assignment</div>
          <h1>Select your sector</h1>
        </div>
      </div>
      <div class="summary-strip">
        <div><span>Current sector</span><strong>${escapeHtml(profile.sector)}</strong></div>
        <div><span>Worker</span><strong>${escapeHtml(profile.name)}</strong></div>
        <div><span>Daily rate</span><strong>${inr(profile.dailyRate)}</strong></div>
      </div>
      <form class="form-panel" id="form-sector">
        <div class="form-grid two">
          <div class="field"><label>Working sector</label>
            <select name="sector">${SECTORS.map((s) => `<option ${profile.sector === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Shift note</label><input name="shiftNote" value="${escapeAttr(profile.shiftNote || "")}" placeholder="Morning / evening" /></div>
        </div>
        <div class="form-actions">
          <span>Choose the sector you belong to on the floor</span>
          <button class="btn btn-primary" type="submit">Save sector</button>
        </div>
      </form>
    `;

    $("#form-sector", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = state.session.email;
      state.workerProfiles[email] = {
        ...profile,
        sector: String(fd.get("sector")),
        shiftNote: String(fd.get("shiftNote") || "").trim(),
      };
      save();
      toast("Sector updated.");
      setWorkerSection("sector");
    });
  }

  function renderWorkerTime(root) {
    const profile = workerProfile();
    if (!profile) {
      root.innerHTML = needRegister();
      return;
    }

    const email = state.session.email;
    const myAtt = state.attendance.filter((a) => a.email === email);
    const period = root._period || "day";

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Attendance</div>
          <h1>Time management</h1>
        </div>
      </div>
      <form class="form-panel" id="form-att">
        <div style="font-weight:650;font-size:0.85rem">Entry &amp; exit</div>
        <div class="form-grid four">
          <div class="field"><label>Date</label><input name="date" type="date" value="${todayISO()}" required /></div>
          <div class="field"><label>Entry time</label><input name="entry" type="time" value="09:00" required /></div>
          <div class="field"><label>Exit time</label><input name="exit" type="time" value="18:00" required /></div>
          <div class="field"><label>Note</label><input name="note" placeholder="Overtime / leave half day" /></div>
        </div>
        <div class="form-actions">
          <span>Logged like an attendance report</span>
          <button class="btn btn-primary" type="submit">Save attendance</button>
        </div>
      </form>
      <div class="period-tabs" id="att-period">
        <button type="button" class="chip ${period === "day" ? "active" : ""}" data-period="day">Day wise</button>
        <button type="button" class="chip ${period === "week" ? "active" : ""}" data-period="week">Week wise</button>
        <button type="button" class="chip ${period === "month" ? "active" : ""}" data-period="month">Month wise</button>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Attendance report — ${period}</h2></div>
        ${renderAttendanceTable(filterAttendance(myAtt, period))}
      </div>
    `;

    $("#form-att", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const entry = String(fd.get("entry"));
      const exit = String(fd.get("exit"));
      const hours = calcHours(entry, exit);
      state.attendance.push({
        id: uid(),
        email,
        name: profile.name,
        date: String(fd.get("date")),
        entry,
        exit,
        hours,
        note: String(fd.get("note") || "").trim(),
      });
      save();
      toast("Attendance saved.");
      setWorkerSection("time");
    });

    $$("[data-period]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        root._period = btn.dataset.period;
        renderWorkerTime(root);
      });
    });
  }

  function filterAttendance(rows, period) {
    const now = new Date();
    if (period === "day") {
      const d = todayISO();
      return rows.filter((r) => r.date === d);
    }
    if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return rows.filter((r) => new Date(r.date) >= start);
    }
    const ym = todayISO().slice(0, 7);
    return rows.filter((r) => r.date.startsWith(ym));
  }

  function renderAttendanceTable(rows) {
    if (!rows.length) {
      return `<div class="empty"><strong>No records in this period</strong><span>Log entry and exit times above.</span></div>`;
    }
    const totalHours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
    return `
      <div class="summary-strip" style="margin-top:0">
        <div><span>Days logged</span><strong>${rows.length}</strong></div>
        <div><span>Total hours</span><strong>${totalHours.toFixed(1)}</strong></div>
        <div><span>Avg hours / day</span><strong>${(totalHours / rows.length).toFixed(1)}</strong></div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr>
        <th>Date</th><th>Entry</th><th>Exit</th><th>Hours</th><th>Note</th>
      </tr></thead><tbody>
      ${rows
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          (r) => `<tr>
          <td>${r.date}</td>
          <td>${r.entry}</td>
          <td>${r.exit}</td>
          <td>${Number(r.hours).toFixed(1)}</td>
          <td>${escapeHtml(r.note || "—")}</td>
        </tr>`
        )
        .join("")}
      </tbody></table></div>`;
  }

  function renderWorkerSalary(root) {
    const profile = workerProfile();
    if (!profile) {
      root.innerHTML = needRegister();
      return;
    }

    const email = state.session.email;
    const monthAtt = filterAttendance(
      state.attendance.filter((a) => a.email === email),
      "month"
    );
    const suggestedDays = monthAtt.length || 0;

    root.innerHTML = `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Earnings</div>
          <h1>Salary calculator</h1>
        </div>
      </div>
      <form class="form-panel" id="form-wsal">
        <div style="font-weight:650;font-size:0.85rem">Enter work inputs to calculate income</div>
        <div class="form-grid">
          <div class="field"><label>Daily rate (₹)</label><input name="dailyRate" type="number" min="0" value="${profile.dailyRate}" required /></div>
          <div class="field"><label>Days worked</label><input name="days" type="number" min="0" max="31" value="${suggestedDays || 26}" required /></div>
          <div class="field"><label>Overtime hours</label><input name="otHours" type="number" min="0" value="0" /></div>
          <div class="field"><label>OT rate per hour (₹)</label><input name="otRate" type="number" min="0" value="${Math.round(profile.dailyRate / 8)}" /></div>
          <div class="field"><label>Bonus (₹)</label><input name="bonus" type="number" min="0" value="0" /></div>
          <div class="field"><label>Deductions (₹)</label><input name="deductions" type="number" min="0" value="0" /></div>
        </div>
        <div class="form-actions">
          <span>Uses this month's attendance (${suggestedDays} days) as a hint</span>
          <button class="btn btn-primary" type="submit">Calculate salary</button>
        </div>
      </form>
      <div class="panel" id="salary-result">
        <div class="empty"><strong>Result appears here</strong><span>Fill the inputs and calculate income to be received.</span></div>
      </div>
    `;

    $("#form-wsal", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const dailyRate = Number(fd.get("dailyRate"));
      const days = Number(fd.get("days"));
      const otHours = Number(fd.get("otHours") || 0);
      const otRate = Number(fd.get("otRate") || 0);
      const bonus = Number(fd.get("bonus") || 0);
      const deductions = Number(fd.get("deductions") || 0);
      const base = dailyRate * days;
      const ot = otHours * otRate;
      const gross = base + ot + bonus;
      const net = Math.max(0, gross - deductions);

      $("#salary-result", root).innerHTML = `
        <div class="panel-head"><h2>Income to be received</h2></div>
        <div class="metric-grid">
          <div class="metric-cell"><div class="metric-label">Base pay</div><div class="metric-value">${inr(base)}</div></div>
          <div class="metric-cell"><div class="metric-label">Overtime</div><div class="metric-value">${inr(ot)}</div></div>
          <div class="metric-cell amber"><div class="metric-label">Bonus</div><div class="metric-value">${inr(bonus)}</div></div>
          <div class="metric-cell"><div class="metric-label">Deductions</div><div class="metric-value">${inr(deductions)}</div></div>
          <div class="metric-cell amber"><div class="metric-label">Net receivable</div><div class="metric-value profit">${inr(net)}</div></div>
        </div>
      `;
      toast(`You should receive ${inr(net)}`);
    });
  }

  function needRegister() {
    return `
      <div class="page-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-rule"></span> Locked</div>
          <h1>Register first</h1>
        </div>
      </div>
      <div class="empty">
        <strong>Complete worker registration</strong>
        <span>Go to Register in the sidebar, then return here.</span>
        <button type="button" class="btn btn-primary" id="goto-reg" style="margin-top:12px;width:auto">Go to Register</button>
      </div>
    `;
  }

  /* ——— Helpers ——— */
  function calcHours(entry, exit) {
    const [eh, em] = entry.split(":").map(Number);
    const [xh, xm] = exit.split(":").map(Number);
    let mins = xh * 60 + xm - (eh * 60 + em);
    if (mins < 0) mins += 24 * 60;
    return Math.round((mins / 60) * 10) / 10;
  }

  function initials(name) {
    return String(name || "?")
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function statusBadge(s) {
    const map = {
      Completed: "badge-ok",
      Ready: "badge-ok",
      "In progress": "badge-warn",
      Delayed: "badge-bad",
      Pending: "badge-muted",
    };
    return `<span class="badge ${map[s] || "badge-muted"}">${escapeHtml(s)}</span>`;
  }

  function conditionBadge(c) {
    const map = {
      Good: "badge-ok",
      Damaged: "badge-bad",
      "Needs rework": "badge-warn",
      Hold: "badge-muted",
    };
    return `<span class="badge ${map[c] || "badge-muted"}">${escapeHtml(c)}</span>`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  /* ——— Wire UI ——— */
  function bindGlobal() {
    setupAuth();

    $("#pick-management").addEventListener("click", () => openManagement("overview"));
    $("#pick-worker").addEventListener("click", () => openWorker("register"));

    $("#btn-logout-role").addEventListener("click", logout);
    $("#btn-logout-mgmt").addEventListener("click", logout);
    $("#btn-logout-worker").addEventListener("click", logout);

    $("#btn-back-mgmt").addEventListener("click", () => showView("view-role"));
    $("#btn-back-worker").addEventListener("click", () => showView("view-role"));

    $$("#mgmt-nav .nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setMgmtSection(btn.dataset.mgmt));
    });

    $$("#worker-nav .nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.worker;
        if (section !== "register" && !workerProfile()) {
          toast("Register first.", true);
          setWorkerSection("register");
          return;
        }
        setWorkerSection(section);
      });
    });

    document.addEventListener("click", (e) => {
      if (e.target?.id === "goto-reg") setWorkerSection("register");
    });
  }

  async function boot() {
    bindGlobal();
    state = await loadFromServer();
    if (state.session) enterApp();
    else showView("view-auth");
  }

  boot();
})();
