(function () {
  "use strict";

  const csrfToken = () => {
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
  };

  // --- Sidebar (mobil) ---
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const openBtn = document.getElementById("sidebar-open");
  const closeBtn = document.getElementById("sidebar-close");

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove("-translate-x-full");
    if (overlay) overlay.classList.remove("hidden");
  }
  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
  }
  openBtn && openBtn.addEventListener("click", openSidebar);
  closeBtn && closeBtn.addEventListener("click", closeSidebar);
  overlay && overlay.addEventListener("click", closeSidebar);

  // --- Mavzu ---
  const themeBtn = document.getElementById("theme-toggle");
  themeBtn &&
    themeBtn.addEventListener("click", async () => {
      const isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", isDark ? "DARK" : "LIGHT");
      try {
        await fetch(themeBtn.dataset.url, {
          method: "POST",
          headers: {
            "X-CSRFToken": csrfToken(),
            "X-Requested-With": "XMLHttpRequest",
          },
        });
      } catch (error) {
        /* offline — lokal holat saqlanadi */
      }
    });

  // --- Toast ---
  document.querySelectorAll("[data-toast]").forEach((toast) => {
    const close = () => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 220);
    };
    const btn = toast.querySelector("[data-toast-close]");
    btn && btn.addEventListener("click", close);
    setTimeout(close, 5200);
  });

  // --- Tasdiqlash ---
  document.querySelectorAll("[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!window.confirm(form.dataset.confirm || "Tasdiqlaysizmi?")) {
        event.preventDefault();
      }
    });
  });
  document.querySelectorAll("[data-confirm-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!window.confirm(link.dataset.confirmLink || "Tasdiqlaysizmi?")) {
        event.preventDefault();
      }
    });
  });

  // --- Modal ---
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.classList.add("overflow-hidden");
    const focusable = modal.querySelector("input, textarea, select, button");
    focusable && focusable.focus();
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.classList.remove("overflow-hidden");
  }
  document.querySelectorAll("[data-modal-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById(btn.dataset.modalOpen);
      if (btn.dataset.fill) {
        try {
          const payload = JSON.parse(btn.dataset.fill);
          Object.keys(payload).forEach((key) => {
            const field = modal.querySelector(`[name="${key}"]`);
            if (field) field.value = payload[key];
            const label = modal.querySelector(`[data-fill="${key}"]`);
            if (label) label.textContent = payload[key];
          });
        } catch (error) {
          /* ignore */
        }
      }
      openModal(btn.dataset.modalOpen);
    });
  });
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.closest("[id]")));
  });
  document.querySelectorAll("[data-modal]").forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll("[data-modal]").forEach((modal) => {
        if (!modal.classList.contains("hidden")) closeModal(modal);
      });
    }
  });

  // --- Chat ---
  const chatRoot = document.getElementById("chat-root");
  if (chatRoot) {
    const conversationId = chatRoot.dataset.conversation;
    const messagesUrl = chatRoot.dataset.messagesUrl;
    const sendUrl = chatRoot.dataset.sendUrl;
    const list = document.getElementById("chat-messages");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const fileInput = document.getElementById("chat-file");
    let lastId = parseInt(chatRoot.dataset.lastId || "0", 10);

    function scrollBottom() {
      if (list) list.scrollTop = list.scrollHeight;
    }
    scrollBottom();

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text || "";
      return div.innerHTML;
    }

    function fileMarkup(message) {
      if (!message.file_url) return "";
      if (message.type === "IMAGE") {
        return `<a href="${message.file_url}" target="_blank" rel="noopener"><img src="${message.file_url}" alt="rasm" class="mt-1 max-h-64 rounded-xl object-cover"></a>`;
      }
      if (message.type === "VIDEO") {
        return `<video src="${message.file_url}" controls class="mt-1 max-h-64 w-full rounded-xl"></video>`;
      }
      if (message.type === "VOICE") {
        return `<audio src="${message.file_url}" controls class="mt-1 w-full"></audio>`;
      }
      return `<a href="${message.file_url}" target="_blank" rel="noopener" class="mt-1 inline-flex items-center gap-1 text-xs underline">📎 ${escapeHtml(message.file_name || "fayl")}</a>`;
    }

    function bubble(message) {
      const mine = message.is_mine;
      const wrapper = document.createElement("div");
      wrapper.className = `flex ${mine ? "justify-end" : "justify-start"}`;
      wrapper.dataset.messageId = message.id;
      wrapper.innerHTML = `
        <div class="chat-bubble ${mine ? "chat-mine" : "chat-theirs"}">
          ${!mine ? `<div class="mb-0.5 text-[11px] font-semibold opacity-70">${escapeHtml(message.sender_name)}</div>` : ""}
          <div class="whitespace-pre-wrap">${escapeHtml(message.text)}</div>
          ${fileMarkup(message)}
          <div class="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
            <span>${escapeHtml(message.created_at)}</span>
            ${message.edited ? "<span>· tahrirlangan</span>" : ""}
            ${mine ? `<span>· ${message.read_count > 0 ? "o'qilgan" : "yuborildi"}</span>` : ""}
          </div>
        </div>`;
      return wrapper;
    }

    function appendMessages(payload) {
      if (!payload || !payload.length) return;
      const empty = document.getElementById("chat-empty");
      if (empty) empty.remove();
      payload.forEach((message) => {
        if (document.querySelector(`[data-message-id="${message.id}"]`)) return;
        list.appendChild(bubble(message));
        lastId = Math.max(lastId, message.id);
      });
      scrollBottom();
    }

    let polling = true;
    async function poll() {
      if (!polling) return;
      try {
        const response = await fetch(`${messagesUrl}?after=${lastId}`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (response.ok) {
          const data = await response.json();
          appendMessages(data.messages);
        }
      } catch (error) {
        /* tarmoq yo'q — keyingi urinish */
      }
      setTimeout(poll, 5000);
    }
    setTimeout(poll, 3000);

    form &&
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = (input.value || "").trim();
        const file = fileInput && fileInput.files[0];
        if (!text && !file) return;
        const data = new FormData();
        data.append("text", text);
        if (file) data.append("file", file);
        form.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          const response = await fetch(sendUrl, {
            method: "POST",
            body: data,
            headers: {
              "X-CSRFToken": csrfToken(),
              "X-Requested-With": "XMLHttpRequest",
            },
          });
          if (response.ok) {
            const payload = await response.json();
            appendMessages([payload.message]);
            input.value = "";
            if (fileInput) fileInput.value = "";
          }
        } catch (error) {
          form.submit();
        } finally {
          form.querySelectorAll("button").forEach((b) => (b.disabled = false));
          input && input.focus();
        }
      });

    input &&
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
  }

  // --- Sana bo'yicha avtomatik yuborish ---
  document.querySelectorAll("[data-auto-submit]").forEach((field) => {
    field.addEventListener("change", () => field.form && field.form.submit());
  });
})();
