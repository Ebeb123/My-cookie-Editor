// My Cookie Editor - popup logic
// Everything here runs when you click the extension icon.

let currentUrl = "";      // URL of the active tab, e.g. https://example.com/page
let allCookies = [];      // cookies for this site
let editingCookie = null; // the cookie being edited (null when adding a new one)

// ---------- Shortcuts for finding elements ----------
const $ = (id) => document.getElementById(id);

// ---------- Start ----------
init();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    $("site").textContent = "Open a normal website (http/https) to see its cookies.";
    $("empty").hidden = true;
    document.querySelector(".toolbar").hidden = true;
    $("search").hidden = true;
    return;
  }
  currentUrl = tab.url;
  $("site").textContent = new URL(currentUrl).hostname;
  await loadCookies();
}

// ---------- Load and show cookies ----------
async function loadCookies() {
  allCookies = await chrome.cookies.getAll({ url: currentUrl });
  allCookies.sort((a, b) => a.name.localeCompare(b.name));
  render();
}

function render() {
  const query = $("search").value.trim().toLowerCase();
  const shown = allCookies.filter(
    (c) => c.name.toLowerCase().includes(query) || c.value.toLowerCase().includes(query)
  );

  const list = $("list");
  list.replaceChildren(); // clear old rows
  $("empty").hidden = shown.length > 0;

  for (const cookie of shown) {
    const li = document.createElement("li");

    const name = document.createElement("div");
    name.className = "c-name";
    name.textContent = cookie.name;

    const value = document.createElement("div");
    value.className = "c-value";
    value.textContent = cookie.value;

    const meta = document.createElement("div");
    meta.className = "c-meta";
    const expires = cookie.session
      ? "session"
      : "expires " + new Date(cookie.expirationDate * 1000).toLocaleString();
    meta.textContent = `${cookie.domain}${cookie.path} - ${expires}`;

    const actions = document.createElement("div");
    actions.className = "c-actions";
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditor(cookie));
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteCookie(cookie));
    actions.append(editBtn, delBtn);

    li.append(name, value, meta, actions);
    list.append(li);
  }
}

// ---------- Helpers ----------
// A cookie is identified by name + the URL it belongs to, so we build that URL.
function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, ""); // ".example.com" -> "example.com"
  return (cookie.secure ? "https://" : "http://") + host + cookie.path;
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ---------- Delete ----------
async function deleteCookie(cookie) {
  await chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name, storeId: cookie.storeId });
  await loadCookies();
}

$("btn-delete-all").addEventListener("click", async () => {
  if (!allCookies.length) return;
  if (!confirm(`Delete all ${allCookies.length} cookies for this site?`)) return;
  for (const c of allCookies) {
    await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId });
  }
  await loadCookies();
});

// ---------- Add / Edit ----------
function openEditor(cookie) {
  editingCookie = cookie; // null means "add new"
  $("error").hidden = true;
  $("editor-title").textContent = cookie ? "Edit cookie" : "Add cookie";

  const host = new URL(currentUrl).hostname;
  $("f-name").value = cookie ? cookie.name : "";
  $("f-value").value = cookie ? cookie.value : "";
  $("f-domain").value = cookie ? cookie.domain : host;
  $("f-path").value = cookie ? cookie.path : "/";
  $("f-session").checked = cookie ? cookie.session : true;
  $("f-expires").value = cookie && !cookie.session ? toLocalInput(cookie.expirationDate) : "";
  $("f-secure").checked = cookie ? cookie.secure : currentUrl.startsWith("https:");
  $("f-httponly").checked = cookie ? cookie.httpOnly : false;
  $("f-samesite").value = cookie ? cookie.sameSite : "unspecified";
  $("f-expires").disabled = $("f-session").checked;

  $("editor").showModal();
}

$("btn-add").addEventListener("click", () => openEditor(null));
$("btn-cancel").addEventListener("click", () => $("editor").close());
$("f-session").addEventListener("change", () => {
  $("f-expires").disabled = $("f-session").checked;
});

$("form").addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the form from closing before we finish

  const newCookie = {
    name: $("f-name").value,
    value: $("f-value").value,
    domain: $("f-domain").value.trim(),
    path: $("f-path").value.trim() || "/",
    secure: $("f-secure").checked,
    httpOnly: $("f-httponly").checked,
    sameSite: $("f-samesite").value,
  };
  if (!$("f-session").checked && $("f-expires").value) {
    newCookie.expirationDate = new Date($("f-expires").value).getTime() / 1000;
  }

  try {
    await saveCookie(newCookie);
    $("editor").close();
    await loadCookies();
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  }
});

// Chrome has no "rename" for cookies, so if the name/domain/path changed we
// remove the old cookie first, then create the new one.
async function saveCookie(cookie) {
  // Keep host-only cookies host-only: only send "domain" if it started with a dot
  // or the user typed something different from the old value.
  const toSet = { ...cookie, url: cookieUrl(cookie) };
  if (editingCookie && editingCookie.hostOnly && cookie.domain === editingCookie.domain) {
    delete toSet.domain;
  }

  const result = await chrome.cookies.set(toSet);
  if (!result) {
    throw new Error(chrome.runtime.lastError?.message || "Chrome refused to save this cookie. Check the domain, path and Secure option.");
  }

  if (editingCookie) {
    const changedKey =
      editingCookie.name !== cookie.name ||
      editingCookie.domain !== cookie.domain ||
      editingCookie.path !== cookie.path;
    if (changedKey) {
      await chrome.cookies.remove({
        url: cookieUrl(editingCookie),
        name: editingCookie.name,
        storeId: editingCookie.storeId,
      });
    }
  }
}

// ---------- Search ----------
$("search").addEventListener("input", render);

// ---------- Export ----------
$("btn-export").addEventListener("click", async () => {
  const json = JSON.stringify(allCookies, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    flash($("btn-export"), "Copied!");
  } catch {
    // Fallback: download as a file
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = new URL(currentUrl).hostname + "-cookies.json";
    a.click();
  }
});

function flash(button, text) {
  const old = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = old), 1200);
}

// ---------- Import ----------
$("btn-import").addEventListener("click", () => {
  $("import-text").value = "";
  $("import-error").hidden = true;
  $("importer").showModal();
});
$("btn-import-cancel").addEventListener("click", () => $("importer").close());

$("btn-import-run").addEventListener("click", async () => {
  try {
    const items = JSON.parse($("import-text").value);
    if (!Array.isArray(items)) throw new Error("Expected a JSON array of cookies.");

    for (const c of items) {
      const host = String(c.domain).replace(/^\./, "");
      const toSet = {
        url: (c.secure ? "https://" : "http://") + host + (c.path || "/"),
        name: c.name,
        value: c.value,
        path: c.path || "/",
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite || "unspecified",
      };
      if (!c.hostOnly) toSet.domain = c.domain;
      if (!c.session && c.expirationDate) toSet.expirationDate = c.expirationDate;
      await chrome.cookies.set(toSet);
    }
    $("importer").close();
    await loadCookies();
  } catch (err) {
    $("import-error").textContent = "Import failed: " + err.message;
    $("import-error").hidden = false;
  }
});
