const express = require("express");
const axios = require("axios");
const path = require("path");
const url = require("url");
const fs = require("fs");
const os = require("os");
const { spawn, execSync } = require("child_process");
const ytdlp = require("yt-dlp-exec");

// --- PUPPETEER STEALTH AGENT SETUP ---
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (Render/Railway)
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

// Health check for Render
app.get("/healthz", (req, res) => res.send("ok"));

function getYtDlpInstance() {
    const isWin = os.platform() === "win32";
    const exeName = isWin ? "yt-dlp.exe" : "yt-dlp";
    const candidates = [
        path.join(__dirname, exeName),
        path.join(__dirname, "node_modules", "yt-dlp-exec", "bin", exeName),
        path.join(__dirname, "node_modules", "yt-dlp-exec", "bin", "yt-dlp"),
        "/usr/bin/yt-dlp",
        "/usr/local/bin/yt-dlp"
    ];
    // PATH lookup (Linux & Windows)
    try {
        const cmd = isWin ? "where yt-dlp" : "which yt-dlp";
        const found = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0].trim();
        if (found) candidates.push(found);
    } catch (_) {}

    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            try { fs.accessSync(p, fs.constants.X_OK); } catch (_) { continue; }
            console.log(`[yt-dlp] Using binary: ${p}`);
            return ytdlp.create(p);
        }
    }
    console.log("[yt-dlp] Using yt-dlp-exec default binary");
    return ytdlp;
}

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return "Unknown size";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function buildCookieOptions(cookieMode) {
    const options = {};
    if (cookieMode === "chrome" || cookieMode === "edge" || cookieMode === "firefox" || cookieMode === "brave") {
        options.cookiesFromBrowser = cookieMode;
    } else if (cookieMode === "file") {
        const cookieFile = path.join(__dirname, "cookies.txt");
        if (fs.existsSync(cookieFile)) options.cookies = cookieFile;
    }
    return options;
}

function formatCleanError(errMessage, platformName) {
    let msg = errMessage || "Unknown extraction error";
    if (msg.includes("ERROR:")) msg = msg.split("ERROR:")[1].split("\n")[0].trim();
    else msg = msg.split("\n")[0].trim();

    if (msg.includes("DPAPI") || msg.includes("Failed to decrypt")) {
        return `Browser Security Error: Google Chrome / Edge blocks direct cookie reading on Windows. Please use the "ðŸ“ Use Local 'cookies.txt' File" option below!`;
    }
    if (msg.includes("HTTP Error 403") || msg.includes("age-restricted") || msg.includes("Over 18")) {
        return `${platformName} Error: This video is age-restricted (18+/NSFW) or private. Please use the "ðŸ“ Use Local 'cookies.txt' File" option below!`;
    }
    if (msg.includes("Login required") || msg.includes("Private")) {
        return `${platformName} Error: This account or video is private. Please use the "ðŸ“ Use Local 'cookies.txt' File" option below!`;
    }
    return `${platformName} Error: ${msg}`;
}

// --- PUPPETEER CHROMIUM RESOLVER (cross-platform / Linux containers) ---
function getPuppeteerLaunchOptions() {
    const isLinux = os.platform() === "linux";
    const args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--mute-audio",
        "--disable-web-security"
    ];
    const opts = { headless: "new", args, ignoreHTTPSErrors: true };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (isLinux) {
        for (const c of ["/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"]) {
            if (fs.existsSync(c)) { opts.executablePath = c; break; }
        }
    }
    return opts;
}

// --- ENGINE 5: AUTONOMOUS HEADLESS WEB SNIFFER AGENT ---
async function sniffStreamWithAgent(targetUrl) {
    console.log(`ðŸ¤– [AI Agent] Launching invisible anti-detect browser for: ${targetUrl}`);
    let browser = null;
    try {
        browser = await puppeteer.launch(getPuppeteerLaunchOptions());

        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1280, height: 720 });

        let capturedStreamUrl = null;
        await page.setRequestInterception(true);

        page.on("request", (req) => {
            const u = req.url();
            // Listen for hidden m3u8 playlists or direct mp4/flv streams
            if (!capturedStreamUrl && (u.includes(".m3u8") || (u.includes(".mp4") && !u.endsWith(".html")))) {
                console.log(`ðŸ¤– [AI Agent] Snatched hidden stream mid-air: ${u.substring(0, 70)}...`);
                capturedStreamUrl = u;
            }
            req.continue();
        });

        console.log("ðŸ¤– [AI Agent] Navigating to movie page...");
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });

        // Simulate human clicks on any play buttons or video frames to trigger stream
        try {
            await page.evaluate(() => {
                const btns = document.querySelectorAll("button, [class*='play'], [id*='play'], video, .vjs-big-play-button");
                btns.forEach(b => { if (b && b.click) b.click(); });
            });
        } catch (e) {}

        // Wait up to 8 seconds for the stream packet to be snatched
        for (let i = 0; i < 16; i++) {
            if (capturedStreamUrl) break;
            await new Promise(r => setTimeout(r, 500));
        }

        const pageTitle = await page.title();
        await browser.close();

        if (!capturedStreamUrl) {
            throw new Error("No playable m3u8 or video stream packet fired on this webpage.");
        }

        return {
            streamUrl: capturedStreamUrl,
            title: pageTitle ? pageTitle.replace(/[/\\?%*:|"<>]/g, "_").trim() : "Sniffed_Movie_Stream"
        };
    } catch (err) {
        if (browser) await browser.close();
        throw err;
    }
}

// Endpoint 1: Inspect URL across 5 Universal Engines
app.get("/api/process", async (req, res) => {
    const mediaUrl = req.query.url;
    const cookieMode = req.query.cookies || "none";
    if (!mediaUrl) return res.status(400).json({ error: "Please provide a valid URL" });

    const startTime = Date.now();
    console.log(`\nâš¡ Inspecting link: ${mediaUrl} (Cookie Mode: ${cookieMode})`);

    // --- ENGINE 1: SPOTIFY METADATA BRIDGE ---
    if (/spotify\.com\/track\//i.test(mediaUrl)) {
        try {
            const spRes = await axios.get(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 6000 });
            const html = spRes.data;
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
            const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
            const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);

            const songTitle = titleMatch ? titleMatch[1] : "Spotify Song";
            const artistRaw = descMatch ? descMatch[1].split("Â·")[0].trim() : "Spotify Artist";
            const fullQuery = `${artistRaw} - ${songTitle}`;

            return res.json({
                success: true,
                isSocial: true,
                filename: fullQuery.replace(/[/\\?%*:|"<>]/g, "_") + ".mp3",
                title: fullQuery,
                uploader: `Spotify: ${artistRaw}`,
                duration: "Audio Track",
                thumbnail: imgMatch ? imgMatch[1] : null,
                formattedSize: "High Quality MP3",
                platform: "Spotify Music",
                directDownloadUrl: `ytsearch1:${fullQuery} audio`
            });
        } catch (e) {
            return res.status(400).json({ error: "Could not read Spotify song info." });
        }
    }

    // --- ENGINE 2: DEDICATED TWITTER / X HIGH-SPEED API ---
    const twitterMatch = mediaUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/i);
    if (twitterMatch) {
        try {
            const vxRes = await axios.get(`https://api.vxtwitter.com/${twitterMatch[1]}/status/${twitterMatch[2]}`, { timeout: 5000 });
            const data = vxRes.data;
            if (!data.hasMedia || !data.mediaURLs?.length) return res.status(400).json({ error: "No video found inside tweet." });

            const rawTitle = (data.text || `Tweet by ${data.user_name}`).substring(0, 60);
            return res.json({
                success: true,
                isSocial: true,
                filename: rawTitle.replace(/[/\\?%*:|"<>#\n]/g, "_").trim() + ".mp4",
                title: rawTitle,
                uploader: `${data.user_name} (@${data.user_screen_name})`,
                duration: "Full Video",
                thumbnail: data.media_extended?.[0]?.thumbnail_url || null,
                formattedSize: "Direct HD Stream",
                platform: "Twitter / X",
                directDownloadUrl: data.mediaURLs[0]
            });
        } catch (e) {
            return res.status(400).json({ error: "Could not extract Twitter video." });
        }
    }

    // --- INSTANT 0.2s REDDIT 18+ FAST-DETECTOR ---
    const isReddit = /reddit\.com|redd\.it/i.test(mediaUrl);
    if (isReddit && cookieMode === "none") {
        try { await axios.get(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 3000 }); }
        catch (fastErr) {
            if (fastErr.response?.status === 403 || fastErr.response?.status === 429) {
                return res.status(400).json({ error: "Reddit Error: This post is age-restricted (18+/NSFW). Please use the 'ðŸ“ Use Local cookies.txt File' option below!" });
            }
        }
    }

    // --- ENGINE 3: UNIVERSAL SOCIAL EXTRACTOR ---
    const isOtherSocial = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|vimeo\.com|reddit\.com|redd\.it|dailymotion\.com|soundcloud\.com/i.test(mediaUrl);
    if (isOtherSocial) {
        try {
            const extractor = getYtDlpInstance();
            const cookieOptions = buildCookieOptions(cookieMode);

            const output = await extractor(mediaUrl, {
                dumpSingleJson: true,
                noWarnings: true,
                noCallHome: true,
                noPlaylist: true,
                noCheckCertificates: true,
                youtubeSkipDashManifest: true,
                ...cookieOptions
            });

            const rawTitle = output.title || "Social_Video";
            return res.json({
                success: true,
                isSocial: true,
                filename: rawTitle.replace(/[/\\?%*:|"<>]/g, "-") + ".mp4",
                title: rawTitle,
                uploader: output.uploader || output.channel || "Social Platform",
                duration: output.duration_string || `${output.duration || "?"} sec`,
                thumbnail: output.thumbnail || null,
                formattedSize: formatBytes(output.filesize_approx || output.filesize),
                platform: output.extractor_key || "Social Media"
            });
        } catch (ytdlpErr) {
            return res.status(400).json({ error: formatCleanError(ytdlpErr.message, isReddit ? "Reddit" : "Platform") });
        }
    }

    // --- ENGINE 4 & 5: DIRECT WEB MEDIA vs AUTONOMOUS SNIFFER AGENT ---
    try {
        let contentType = "application/octet-stream";
        let contentLength = null;

        try {
            const headResponse = await axios.head(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 3000 });
            contentType = headResponse.headers["content-type"] || contentType;
            contentLength = headResponse.headers["content-length"];
        } catch (headErr) {
            const getResponse = await axios.get(mediaUrl, {
                headers: { "User-Agent": "Mozilla/5.0", "Range": "bytes=0-1" },
                timeout: 3500,
                responseType: "stream"
            });
            contentType = getResponse.headers["content-type"] || contentType;
            const contentRange = getResponse.headers["content-range"];
            if (contentRange && contentRange.includes("/")) contentLength = parseInt(contentRange.split("/")[1], 10);
            getResponse.data.destroy();
        }

        // If it's an HTML webpage (like moviebox.ph or embedded movie sites), wake up our AI Agent!
        if (contentType.includes("text/html")) {
            console.log("-> Web portal detected. Waking up Engine 5: Autonomous Web Sniffer Agent...");
            try {
                const sniffResult = await sniffStreamWithAgent(mediaUrl);
                return res.json({
                    success: true,
                    isSocial: true,
                    filename: sniffResult.title + ".mp4",
                    title: sniffResult.title,
                    uploader: "Autonomous Web Agent",
                    duration: "Movie Stream",
                    thumbnail: null,
                    formattedSize: "Stitched HLS Stream",
                    platform: "Sniffer Agent",
                    directDownloadUrl: sniffResult.streamUrl
                });
            } catch (agentErr) {
                console.error("ðŸ¤– [AI Agent] Sniff failed:", agentErr.message);
                return res.status(400).json({ 
                    error: `Autonomous Agent Error: Could not sniff an active stream. Make sure the link is an exact movie playback page, or copy the .m3u8 stream using F12.` 
                });
            }
        }

        const parsedUrl = url.parse(mediaUrl);
        return res.json({
            success: true,
            isSocial: false,
            filename: path.basename(parsedUrl.pathname) || "media-file.mp4",
            contentType: contentType,
            formattedSize: formatBytes(contentLength)
        });
    } catch (error) {
        return res.status(400).json({ error: "Could not access URL. Please verify the link is active." });
    }
});

// Endpoint 2: Stream media download
app.get("/api/download", async (req, res) => {
    const mediaUrl = req.query.url;
    const directTargetUrl = req.query.directUrl;
    const cookieMode = req.query.cookies || "none";
    let customFilename = req.query.filename;
    if (!mediaUrl && !directTargetUrl) return res.status(400).send("No URL provided");

    try {
        let filename = customFilename || "downloaded_file";
        const downloadTarget = directTargetUrl || mediaUrl;

        if (downloadTarget.startsWith("ytsearch1:") || filename.endsWith(".mp3")) {
            if (!filename.includes(".")) filename += ".mp3";
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Type", "audio/mpeg");

            const extractor = getYtDlpInstance();
            const cookieOptions = buildCookieOptions(cookieMode);
            const subprocess = extractor.exec(downloadTarget, { output: "-", format: "bestaudio/best", noCheckCertificates: true, ...cookieOptions });
            subprocess.stdout.pipe(res);
            req.on("close", () => { if (!subprocess.killed) subprocess.kill("SIGKILL"); });
            return;
        }

        if (!filename.includes(".")) filename += ".mp4";
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        // If downloading a sniffed m3u8 stream or YouTube/social video, use yt-dlp to stitch/stream
        if (!directTargetUrl && /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|vimeo\.com|reddit\.com|redd\.it/i.test(mediaUrl) || downloadTarget.includes(".m3u8")) {
            res.setHeader("Content-Type", "video/mp4");
            const extractor = getYtDlpInstance();
            const cookieOptions = buildCookieOptions(cookieMode);

            const subprocess = extractor.exec(downloadTarget, { output: "-", format: "best", noCheckCertificates: true, ...cookieOptions });
            subprocess.stdout.pipe(res);
            req.on("close", () => { if (!subprocess.killed) subprocess.kill("SIGKILL"); });
            return;
        }

        const response = await axios({ method: "GET", url: downloadTarget, responseType: "stream", headers: { "User-Agent": "Mozilla/5.0" } });
        if (response.headers["content-type"]) res.setHeader("Content-Type", response.headers["content-type"]);
        response.data.pipe(res);
    } catch (error) {
        res.status(500).send("Failed to download media file.");
    }
});

app.listen(PORT, () => {
    console.log(`ðŸš€ 5-Engine Universal & Autonomous Sniffer Server running at http://localhost:${PORT}`);
});