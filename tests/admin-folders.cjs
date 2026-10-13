const assert = require("node:assert/strict");
(async () => {
  const { createAdministration } =
    await import("../src/admin/administration.js");
  const data = { folders: [], documents: [], plants: [] },
    user = { role: "Admin" },
    nodes = new Map();
  let html = "",
    tab = "docs",
    allow = true,
    saves = 0;
  const node = (k) => {
    if (!nodes.has(k)) nodes.set(k, {});
    return nodes.get(k);
  };
  let branches = [];
  global.document = {
    querySelector: node,
    querySelectorAll: (s) => (s === "[data-folder-branch]" ? branches : []),
  };
  const api = createAdministration({
    data,
    user,
    esc: String,
    options: () => "",
    show: (s) => (html = s),
    modal: { close() {} },
    save: () => {
      saves++;
      return allow;
    },
    render() {},
    toast() {},
    getState: () => ({ tab }),
  });
  function submit(name, parent = "") {
    node("#folder-form").onsubmit({
      preventDefault() {},
      currentTarget: {
        elements: { folderName: { value: name }, parentId: { value: parent } },
      },
    });
  }
  api.folderForm("s");
  submit("Schemas");
  const root = data.folders[0].id;
  api.folderForm("s", null, root);
  submit("Oktober", root);
  const child = data.folders[1].id;
  api.folderForm("s", root);
  allow = false;
  submit("Neue Schemas");
  assert.equal(data.folders[0].name, "Schemas");
  allow = true;
  submit("Neue Schemas");
  assert.equal(data.folders[0].name, "Neue Schemas");
  api.folderForm("s");
  submit("Anleitungen");
  const other = data.folders[2].id;
  api.folderForm("s", child);
  submit("November", other);
  assert.equal(data.folders.find((f) => f.id === child).parentId, other);
  let tree = api.folderView("s", "all");
  assert.ok(tree.includes("data-folder-branch="));
  assert.ok(!tree.includes(" open>"));
  branches = [{ dataset: { folderBranch: other }, open: true }];
  api.bindFolders("s", () => {});
  branches[0].ontoggle();
  tree = api.folderView("s", "all");
  assert.ok(tree.includes(`data-folder-branch="${other}" open>`));
  branches[0].open = false;
  branches[0].ontoggle();
  assert.ok(
    !api.folderView("s", "all").includes(`data-folder-branch="${other}" open>`),
  );
  tab = "reports";
  api.folderForm("s");
  submit("Rapporte");
  assert.equal(data.folders.at(-1).sectionId, "reports");
  assert.ok(!api.folderView("s", "all").includes("Neue Schemas"));
  tab = "docs";
  data.documents.push({ id: "d", folderId: child, siteId: "s" });
  api.deleteFolder(other);
  assert.ok(html.includes("1 Unterordner und 1 Dokumente"));
  assert.equal(data.documents.length, 1);
  node("#folder-cancel").onclick();
  assert.equal(data.documents.length, 1);
  api.deleteFolder(other);
  allow = false;
  node("#folder-delete").onclick();
  assert.equal(data.documents.length, 1);
  allow = true;
  node("#folder-delete").onclick();
  assert.equal(data.documents.length, 0);
  assert.ok(!data.folders.some((f) => [child, other].includes(f.id)));
  const count = saves;
  user.role = "WVM";
  api.folderForm("s");
  api.deleteFolder(root);
  assert.equal(saves, count);
  console.log(
    "Passed: folder create/rename/move/delete with nested contents, save rollback/retry, unchanged expansion state, register isolation and admin rights.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
