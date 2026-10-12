const assert = require("node:assert/strict");
(async () => {
  const { createDocuments } = await import("../src/features/documents.js");
  const { uuid } = await import("../src/services/ids.js");
  const { webcrypto } = require("node:crypto");
  global.crypto = webcrypto;
  assert.match(
    uuid({ getRandomValues: (a) => webcrypto.getRandomValues(a) }),
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  let rendered = 0;
  for (const role of ["Admin", "WVM", "EPC"]) {
    for (const sid of [
      "eiger",
      "monbijou",
      "milch",
      "linden2",
      "linden1",
      "lilien",
    ]) {
      const user = { id: role, name: role + " Test", initials: role, role };
      const data = {
        users: [user],
        documents: [],
        folders: [
          { id: "folder", siteId: sid, name: "Schemas" },
          { id: "child", siteId: sid, name: "Unterordner", parentId: "folder" },
        ],
      };
      const state = { current: sid, filters: { folder: "folder" } },
        nodes = new Map(),
        files = new Map();
      const node = (key) => {
        if (!nodes.has(key))
          nodes.set(key, {
            dataset: {},
            classList: { add() {}, remove() {} },
            querySelector: () => node("button"),
          });
        return nodes.get(key);
      };
      const target = node("drop");
      target.dataset.dropFolder = "folder";
      const queries = { "[data-drop-folder]": [target] };
      global.document = { querySelectorAll: (key) => queries[key] || [] };
      let html = "",
        saves = true,
        failFile = false;
      const api = createDocuments({
        data,
        user,
        $: node,
        esc: String,
        icon: () => "",
        fmt: () => "date",
        site: () => ({ name: sid }),
        show: (s) => {
          html = s;
        },
        modal: { close() {} },
        save: () => saves,
        render: () => rendered++,
        toast: () => {},
        putFile: async (id, file) => {
          if (failFile) throw Error();
          files.set(id, file);
        },
        getFile: async (id) => files.get(id),
        deleteFile: async (id) => files.delete(id),
        getState: () => state,
        getAdmin: () => ({
          folderView: () => "",
          folderLabel: (id) => id,
          bindFolders() {},
          folderOptions: () => "",
        }),
      });
      api.bindDocs();
      node("#upload").onclick();
      assert.ok(html.includes(sid)); // Regression: site() fehlte im Uploadformular.
      const file = { name: "Schema.pdf", type: "application/pdf", size: 123 };
      await node("#upload-form").onsubmit({
        preventDefault() {},
        currentTarget: {
          elements: { files: { files: [file] } },
          querySelector: () => node("button"),
        },
      });
      assert.equal(data.documents.length, 1);
      assert.equal(data.documents[0].uploadedByName, user.name);
      assert.equal(files.size, 1);
      assert.ok(api.documentsView().includes("Schema.pdf"));
      assert.ok(api.documentsView().includes(user.name));
      const drop = (list) =>
        target.ondrop({
          preventDefault() {},
          stopPropagation() {},
          dataTransfer: { files: list, getData: () => "" },
        });
      await drop([{ name: "Plan.png", type: "image/png", size: 12 }]);
      assert.equal(data.documents.length, 2);
      assert.equal(files.size, 2);
      const row = node("row");
      row.dataset.dragDocument = data.documents[0].id;
      row.dataset.openDocument = row.dataset.dragDocument;
      queries["[data-drag-document]"] = [row];
      target.dataset.dropFolder = "child";
      api.bindDocs();
      await target.ondrop({
        preventDefault() {},
        stopPropagation() {},
        dataTransfer: { files: [], getData: () => row.dataset.dragDocument },
      });
      assert.equal(data.documents[0].folderId, "child");
      if (role !== "Admin") {
        const foreign = {
          ...data.documents[0],
          id: "admin-document",
          name: "Admin.pdf",
          folderId: "folder",
          uploadedById: "admin",
          uploadedBy: "ADM",
        };
        data.documents.push(foreign);
        const view = api.documentsView();
        assert.ok(view.includes('data-download="admin-document"'));
        assert.ok(!view.includes('data-rename="admin-document"'));
        assert.ok(!view.includes('data-delete="admin-document"'));
        await target.ondrop({
          preventDefault() {},
          stopPropagation() {},
          dataTransfer: { files: [], getData: () => foreign.id },
        });
        assert.equal(foreign.folderId, "folder");
        data.documents = data.documents.filter((d) => d.id !== foreign.id);
      }
      saves = false;
      await drop([{ name: "failed.pdf", type: "application/pdf", size: 2 }]);
      assert.equal(data.documents.length, 2);
      assert.equal(files.size, 2); // Metadatenfehler entfernt auch die gespeicherte Datei.
      saves = true;
      failFile = true;
      await drop([{ name: "failed2.pdf", type: "application/pdf", size: 2 }]);
      assert.equal(data.documents.length, 2);
      assert.equal(files.size, 2);
    }
  }
  assert.ok(rendered > 0);
  console.log(
    "Passed: file picker, direct drops, moving, uploader, failure cleanup for all roles and all sites; LAN UUID fallback.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
