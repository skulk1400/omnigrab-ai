document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("download-form");
    const urlInput = document.getElementById("media-url");
    const pasteBtn = document.getElementById("paste-btn");
    const cookieSelect = document.getElementById("cookie-mode");
    const statusMsg = document.getElementById("status-message");
    const resultBox = document.getElementById("result-box");
    const previewContainer = document.getElementById("preview-container");
    
    const typeBadge = document.getElementById("type-badge");
    const authorBadge = document.getElementById("author-badge");
    const durationBadge = document.getElementById("duration-badge");
    const sizeBadge = document.getElementById("size-badge");
    
    const customFilenameInput = document.getElementById("custom-filename");
    const downloadBtn = document.getElementById("download-btn");
    const themeToggleBtn = document.getElementById("theme-toggle");
    const quickChips = document.querySelectorAll(".chip");

    let currentMediaUrl = "";
    let currentDirectUrl = null;
    let currentCookieMode = "none";

    // Theme Toggle
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);

    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
    });

    // 📋 Paste from Clipboard Logic
    pasteBtn.addEventListener("click", async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                urlInput.focus();
                // Subtle pulse animation when pasted
                urlInput.style.borderColor = "#38bdf8";
                setTimeout(() => urlInput.style.borderColor = "", 500);
            }
        } catch (err) {
            alert("Please allow clipboard access or press Ctrl+V inside the input box.");
        }
    });

    // 🏷️ Quick Test Chips Logic
    quickChips.forEach(chip => {
        chip.addEventListener("click", () => {
            urlInput.value = chip.getAttribute("data-url");
            // Auto submit when chip clicked
            form.dispatchEvent(new Event("submit"));
        });
    });

    // Main Submit
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        currentMediaUrl = urlInput.value.trim();
        currentCookieMode = cookieSelect.value;
        currentDirectUrl = null;
        if (!currentMediaUrl) return;

        resultBox.classList.add("hidden");
        showStatus(`⚙️ Waking up OmniGrab AI Engines (${cookieSelect.options[cookieSelect.selectedIndex].text})...`, "loading");

        try {
            const response = await fetch(`/api/process?url=${encodeURIComponent(currentMediaUrl)}&cookies=${encodeURIComponent(currentCookieMode)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to process URL");
            }

            statusMsg.classList.add("hidden");
            resultBox.classList.remove("hidden");

            previewContainer.innerHTML = "";
            authorBadge.style.display = "none";
            durationBadge.style.display = "none";

            currentDirectUrl = data.directDownloadUrl || null;

            if (data.isSocial) {
                typeBadge.textContent = `📺 ${data.platform}`;
                
                if (data.uploader) {
                    authorBadge.textContent = `👤 ${data.uploader}`;
                    authorBadge.style.display = "inline-block";
                }
                if (data.duration) {
                    durationBadge.textContent = `⏱️ ${data.duration}`;
                    durationBadge.style.display = "inline-block";
                }
                
                sizeBadge.textContent = `📦 ${data.formattedSize}`;

                if (data.thumbnail) {
                    previewContainer.innerHTML = `<img src="${data.thumbnail}" alt="Video Thumbnail" />`;
                } else {
                    previewContainer.innerHTML = `<p style="padding: 30px; color: #94a3b8;">Ready to download video</p>`;
                }
            } else {
                sizeBadge.textContent = `📦 ${data.formattedSize}`;
                const cType = (data.contentType || "").toLowerCase();

                if (cType.includes("video") || currentMediaUrl.endsWith(".mp4")) {
                    typeBadge.textContent = "🎬 Direct Video";
                    previewContainer.innerHTML = `<video controls src="${currentMediaUrl}"></video>`;
                } else if (cType.includes("audio") || currentMediaUrl.endsWith(".mp3")) {
                    typeBadge.textContent = "🎵 Direct Audio";
                    previewContainer.innerHTML = `<audio controls src="${currentMediaUrl}"></audio>`;
                } else if (cType.includes("image")) {
                    typeBadge.textContent = "🖼️ Direct Image";
                    previewContainer.innerHTML = `<img src="${currentMediaUrl}" alt="Media Preview" />`;
                } else {
                    typeBadge.textContent = "📄 Direct File";
                }
            }

            customFilenameInput.value = data.filename;
            updateDownloadLink();

        } catch (err) {
            showStatus(`❌ ${err.message}`, "error");
        }
    });

    customFilenameInput.addEventListener("input", updateDownloadLink);
    cookieSelect.addEventListener("change", () => {
        currentCookieMode = cookieSelect.value;
        updateDownloadLink();
    });

    function updateDownloadLink() {
        const filename = customFilenameInput.value.trim();
        let dlUrl = `/api/download?url=${encodeURIComponent(currentMediaUrl)}&filename=${encodeURIComponent(filename)}&cookies=${encodeURIComponent(currentCookieMode)}`;
        if (currentDirectUrl) {
            dlUrl += `&directUrl=${encodeURIComponent(currentDirectUrl)}`;
        }
        downloadBtn.href = dlUrl;
    }

    function showStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = `status ${type}`;
        statusMsg.classList.remove("hidden");
    }
});