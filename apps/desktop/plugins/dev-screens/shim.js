// Browser half of the dev screen harness (see index.ts): stands in for the
// Tauri runtime before the app boots. Invokes go to the Vite dev server;
// live queries are re-run after every write, like the real reactive layer.
(function () {
  var nextId = 1;
  var subscriptions = new Map();
  var listeners = new Map();

  function callback(id, payload) {
    var fn = window["_" + id];
    if (fn) fn(payload);
  }

  function channelId(value) {
    var match = /^__CHANNEL__:(\d+)$/.exec(String(value));
    return match ? Number(match[1]) : null;
  }

  function post(cmd, args) {
    return fetch("/__cue_screens/invoke", {
      method: "POST",
      body: JSON.stringify({ cmd: cmd, args: args || {} }),
    }).then(function (response) {
      return response.json();
    });
  }

  function deliver(subscription, rows) {
    callback(subscription.channel, {
      index: subscription.index++,
      message: { event: "result", data: rows },
    });
  }

  function refresh() {
    subscriptions.forEach(function (subscription) {
      post("plugin:db|execute", {
        sql: subscription.sql,
        params: subscription.params,
      }).then(function (result) {
        if (result.ok && subscriptions.has(subscription.id))
          deliver(subscription, result.payload);
      });
    });
  }

  var query = new URLSearchParams(location.search);

  function invoke(cmd, rawArgs) {
    var args = rawArgs ? JSON.parse(JSON.stringify(rawArgs)) : {};
    if (cmd === "get_onboarding_needed")
      return Promise.resolve(query.has("onboarding"));
    if (cmd === "show_devtool") return Promise.resolve(query.has("devtools"));
    if (cmd === "plugin:local-auth|authenticate")
      return Promise.resolve(query.has("unlock"));
    if (cmd === "plugin:event|listen") {
      var id = args.handler;
      var list = listeners.get(args.event) || [];
      list.push(id);
      listeners.set(args.event, list);
      return Promise.resolve(id);
    }
    if (cmd === "plugin:event|unlisten") return Promise.resolve(null);
    if (cmd === "plugin:event|emit" || cmd === "plugin:event|emit_to") {
      (listeners.get(args.event) || []).forEach(function (id) {
        callback(id, { event: args.event, id: id, payload: args.payload });
      });
      return Promise.resolve(null);
    }
    if (cmd === "plugin:db|unsubscribe") {
      subscriptions.delete(args.subscriptionId);
      return Promise.resolve(null);
    }
    return post(cmd, args).then(function (result) {
      if (!result.ok) throw new Error(result.payload);
      if (cmd === "plugin:db|subscribe") {
        var subscription = {
          id: result.payload.id,
          sql: args.sql,
          params: args.params,
          channel: channelId(args.onEvent),
          index: 0,
        };
        subscriptions.set(subscription.id, subscription);
        deliver(subscription, result.rows);
      }
      if (result.write) setTimeout(refresh, 0);
      return result.payload;
    });
  }

  var label = query.get("window") || "main";
  window.isTauri = true;
  var metadata = {
    currentWindow: { label: label, kind: "WebviewWindow" },
    currentWebview: { label: label, windowLabel: label },
    windows: [{ label: label }],
    webviews: [{ label: label, windowLabel: label }],
  };

  window.__TAURI_INTERNALS__ = {
    metadata: metadata,
    _metadata: metadata,
    plugins: { path: { sep: "/", delimiter: ":" } },
    invoke: invoke,
    transformCallback: function (fn, once) {
      var id = nextId++;
      window["_" + id] = function (payload) {
        if (once) delete window["_" + id];
        if (fn) fn(payload);
      };
      return id;
    },
    unregisterCallback: function (id) {
      delete window["_" + id];
    },
    convertFileSrc: function (path) {
      return path;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: function (event, id) {
      listeners.set(
        event,
        (listeners.get(event) || []).filter(function (other) {
          return other !== id;
        }),
      );
      delete window["_" + id];
    },
  };
  window.__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: "macos",
    os_type: "macos",
    family: "unix",
    version: "15.0",
    arch: "aarch64",
    eol: "\n",
    exe_extension: "",
  };
  window.__CUE_SCREENS__ = { invoke: invoke, refresh: refresh };

  // The window is transparent over native vibrancy; paint the sidebar colour.
  var style = document.createElement("style");
  style.textContent =
    "html:root, html:root body { background: var(--sidebar-background) !important; }";
  document.head.appendChild(style);
})();
