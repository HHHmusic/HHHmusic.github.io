const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const ejs = require('ejs');
const chokidar = require('chokidar');
const http = require('http');
const handler = require('serve-handler');
const mm = require('music-metadata');

let GLOBAL_CONFIG = {};

/* =============== 日志系统 =============== */
const colors = {
    info: (msg) => `\x1b[38;2;28;168;0mINFO\x1b[0m  ${msg}`,     // #1CA800
    error: (msg) => `\x1b[38;2;162;30;41mERROR\x1b[0m ${msg}`,   // #A21E29
};

function log(msg) {
    console.log(colors.info(msg));
}

function logError(msg) {
    console.log(colors.error(msg));
}

function formatTime(ms) {
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

// 性能计时器
const timers = {};
function timeStart(label) {
    timers[label] = Date.now();
}
function timeEnd(label) {
    if (!timers[label]) return '';
    const elapsed = Date.now() - timers[label];
    delete timers[label];
    return formatTime(elapsed);
}

function loadConfig() {
    const raw = fs.readFileSync('_config.yml', 'utf8');
    return yaml.load(raw);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanDirWithKeep(dir, keep = []) {
    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir).forEach(f => {
        if (keep.includes(f)) return;
        fse.removeSync(path.join(dir, f));
    });
}

function syncStaticAssets(SRC, PUB) {

    const ignoreList = new Set([
        'Music-data',
        'api',
        ...(GLOBAL_CONFIG.ignore || [])
    ]);

    fs.readdirSync(SRC).forEach(name => {

        if (ignoreList.has(name)) return;

        const srcPath = path.join(SRC, name);
        const destPath = path.join(PUB, name);

        fse.copySync(srcPath, destPath, {
            overwrite: true,
            recursive: true
        });
    });
}

function renderTpl(TPL, name, data) {
    const file = path.join(TPL, `${name}.ejs`);
    return ejs.render(fs.readFileSync(file, 'utf8'), data, {
        filename: file,
        views: [TPL]
    });
}

function writeFile(dest, html) {
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, html);
    const relativePath = path.relative(process.cwd(), dest);
    log(`已生成: ${relativePath}`);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return { value: '0', unit: 'B' };
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
        value: parseFloat((bytes / Math.pow(k, i)).toFixed(dm)),
        unit: sizes[i]
    };
}

/* ------------------ 数据加载 ------------------ */

function loadMusics(DATA_DIR) {
    const list = [];
    if (!fs.existsSync(DATA_DIR)) return list;

    fs.readdirSync(DATA_DIR).forEach(f => {
        if (!f.endsWith('.json')) return;

        const filePath = path.join(DATA_DIR, f);
        const content = fs.readFileSync(filePath, 'utf8').trim();

        // --- 临时跳过空文件逻辑 ---
        if (!content) {
            logError(`跳过空文件: ${f}`);
            return;
        }

        try {
            const raw = JSON.parse(content);

            list.push({
                title: raw.Title || '未命名',
                homeTitle: raw.HomeTitle || '未命名',
                keywords: raw.Keywords || '',
                desc: raw.Description || '',
                icon: raw.Icon || '',
                bgimg: raw.BgImg || '',
                image: raw.OgImg || '',
                coverimg: raw.CoverImg || '',
                dir: raw.Dir || '',
                pubDate: raw.pubDate || '',
                files: raw.Files || []
            });
        } catch (e) {
            logError(`文件格式错误，已跳过: ${f} | 原因: ${e.message}`);
        }
    });

    return list;
}

/* ------------------ 页面生成 ------------------ */

// 首页
function genHome(TPL, PUB, musics) {
    const html = renderTpl(TPL, 'Home', {
        home: musics.map(m => ({
            MusicDir: m.dir,
            MusicImg: m.coverimg.replace('/images/', ''),
            MusicTitle: m.homeTitle,
            pubDate: m.pubDate
        }))
    });

    writeFile(path.join(PUB, 'index.html'), html);
}

// 音乐播放页
function genMusicPlay(TPL, PUB, music) {

    const html = renderTpl(TPL, 'MusicPlay', {
        music
    });

    const dest = path.join(PUB, music.dir, 'index.html');
    writeFile(dest, html);
}

// 友链
function genFriendPage(TPL, PUB, DOMAIN) {
    const RUNDIR = process.cwd();
    const friendsPath = path.join(RUNDIR, 'friends.yml');
    let friendsData = { MySite: [], others: [] };
    
    if (fs.existsSync(friendsPath)) {
        try {
            const loaded = yaml.load(fs.readFileSync(friendsPath, 'utf8'));
            if (loaded) friendsData = loaded;
        } catch (e) {
            logError(`friends.yml 解析失败: ${e.message}`);
        }
    }

    const html = renderTpl(TPL, 'friend', { 
        domain: DOMAIN,
        site: {
            data: {
                friends: friendsData
            }
        },
        page: {
            content: "" 
        },
        '__': function(key) {
            const trans = { 'friends': '友情链接' };
            return trans[key] || key;
        }
    });
    
    const friendDir = path.join(PUB, 'friend');
    ensureDir(friendDir);
    writeFile(path.join(friendDir, 'index.html'), html);
}

// 统计音乐元信息
async function collectMusicStats(musics, SRC) {
    let totalSizeBytes = 0;
    let totalDurationSec = 0;
    let totalTracks = 0;
    let longestSec = 0;
    let longestName = '无';
    const authors = new Set();

    for (const m of musics) {
        if (!m.files || !Array.isArray(m.files)) continue;

        for (const f of m.files) {
            if (f.type === 'chapter') continue;

            totalTracks++;
            if (f.artist) authors.add(f.artist);

            const relPath = f.path.startsWith('/') ? f.path.slice(1) : f.path;
            const filePath = path.join(process.cwd(), GLOBAL_CONFIG.src, relPath);

            if (fs.existsSync(filePath)) {
                try {
                    const stat = fs.statSync(filePath);
                    totalSizeBytes += stat.size;

                    const metadata = await mm.parseFile(filePath);
                    const duration = metadata.format.duration || 0;
                    totalDurationSec += duration;

                    if (duration > longestSec) {
                        longestSec = duration;
                        longestName = f.name || m.title;
                    }
                } catch (e) {
                    logError(`无法读取元数据: ${filePath} - ${e.message}`);
                }
            }
        }
    }

    return {
        totalCount: totalTracks,
        totalSizeText: formatBytes(totalSizeBytes),
        totalDurationHr: (totalDurationSec / 3600).toFixed(2), // 转换为小时
        avgDuration: totalTracks > 0 ? (totalDurationSec / totalTracks).toFixed(0) : 0,
        longestTrackName: longestName,
        authorCount: authors.size
    };
}

// 生成关于页
function genAboutPage(TPL, PUB, stats) {
    const html = renderTpl(TPL, 'about', { stats });
    const aboutDir = path.join(PUB, 'about');
    ensureDir(aboutDir);
    writeFile(path.join(aboutDir, 'index.html'), html);
}

function genSearchJson(PUB, musics) {
    const searchIndex = [];

    musics.forEach(m => {
        const baseDir = m.dir.replace(/\/$/, '');

        searchIndex.push({
            title: m.title || m.homeTitle,
            brief: m.desc || '',
            play: `/${baseDir}`,
            pubDate: m.pubDate
        });

        if (Array.isArray(m.files)) {
            m.files.forEach(f => {
                let targetUrl = `/${baseDir}`;
                if (f.type === 'chapter') {
                    targetUrl += `?chapter=${encodeURIComponent(f.title)}`;
                    searchIndex.push({
                        title: `${m.title} - ${f.title}`,
                        brief: `章节内容`,
                        play: targetUrl,
                        pubDate: m.pubDate
                    });
                } else {
                    const cleanPath = f.path.replace(/[^a-zA-Z0-9]/g, '');
                    targetUrl += `?track=${cleanPath}`;

                    searchIndex.push({
                        title: f.name || '',
                        brief: `来自专辑: ${m.title} | 艺术家: ${f.artist || '未知'}`,
                        play: targetUrl,
                        pubDate: m.pubDate
                    });
                }
            });
        }
    });

    const apiDir = path.join(PUB, 'api');
    if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'search.json'), JSON.stringify(searchIndex, null, 2));
}

/* ------------------ 主流程 ------------------ */

async function buildAll() {
    timeStart('buildAll');
    
    const RUNDIR = process.cwd();

    const SRC = path.join(RUNDIR, GLOBAL_CONFIG.src);
    const DATA_DIR = path.join(SRC, 'Music-data');
    const PUB = path.join(RUNDIR, GLOBAL_CONFIG.public);
    const TPL = path.join(RUNDIR, GLOBAL_CONFIG.template);
    const DOMAIN = (GLOBAL_CONFIG.domain || '').replace(/^https?:\/\//, '');

    log('读取 Config');

    ensureDir(PUB);
    cleanDirWithKeep(PUB, GLOBAL_CONFIG.clean?.keep || []);

    log('开始处理');

    // ===== 第一阶段：加载所有信息 =====
    timeStart('loadFiles');
    syncStaticAssets(SRC, PUB);
    linkApiDir(SRC, PUB);
    const loadFilesTime = timeEnd('loadFiles');
    log(`文件加载耗时 ${loadFilesTime}`);

    timeStart('loadMusics');
    const musics = loadMusics(DATA_DIR);
    timeEnd('loadMusics');

    log('正在统计音乐元信息...');
    timeStart('collectStats');
    const stats = await collectMusicStats(musics, SRC);
    const statsTime = timeEnd('collectStats');
    log(`统计完成耗时 ${statsTime}`);

    // ===== 第二阶段：生成所有页面 =====
    timeStart('genPages');
    genHome(TPL, PUB, musics);
    musics.forEach(m => genMusicPlay(TPL, PUB, m));
    genFriendPage(TPL, PUB, DOMAIN);
    genSearchJson(PUB, musics);
    genAboutPage(TPL, PUB, stats);
    timeEnd('genPages');

    const totalTime = timeEnd('buildAll');
    log(`已生成 ${musics.length} 个文件 ${totalTime}`);
}

function linkApiDir(SRC, PUB) {

    const srcApi = path.join(SRC, 'api');
    const destApi = path.join(PUB, 'api');

    if (!fs.existsSync(srcApi)) return;

    try {

        if (fs.existsSync(destApi)) {
            fs.rmSync(destApi, { recursive: true, force: true });
        }

        fs.symlinkSync(srcApi, destApi, 'junction');

        const srcApiRel = path.relative(process.cwd(), srcApi);
        const destApiRel = path.relative(process.cwd(), destApi);
        log(`已建立软链接: ${destApiRel} -> ${srcApiRel}`);

    } catch (e) {
        logError(`创建软链接失败: ${e.message}`);
    }
}

/* ------------------ 热更新 ------------------ */

function startWatcher() {

    const RUNDIR = process.cwd();

    const SRC = path.join(RUNDIR, GLOBAL_CONFIG.src);
    const DATA_DIR = path.join(SRC, 'Music-data');
    const PUB = path.join(RUNDIR, GLOBAL_CONFIG.public);
    const TPL = path.join(RUNDIR, GLOBAL_CONFIG.template);
    const DOMAIN = (GLOBAL_CONFIG.domain || '').replace(/^https?:\/\//, '');

    const watcher = chokidar.watch([SRC, TPL, path.join(RUNDIR, 'friends.yml')], {
        ignoreInitial: true
    });

    watcher.on('all', async (event, filePath) => {
        // 静态资源更新
        if (!filePath.endsWith('.json') && !filePath.endsWith('.ejs') && !filePath.endsWith('.yml')) {
            if (event === 'add' || event === 'change' || event === 'addDir') {
                const relPath = path.relative(SRC, filePath);
                log(`静态文件同步: ${relPath}`);
                syncStaticAssets(SRC, PUB);
            } else if (event === 'unlink' || event === 'unlinkDir') {
                const relPath = path.relative(SRC, filePath);
                log(`已删除: ${relPath}`);
            }
            return;
        }

        try {
            const musics = loadMusics(DATA_DIR);
            const affect = GLOBAL_CONFIG.templateAffect || {};

            /* ---------- 友链数据更新 ---------- */
            if (filePath.endsWith('friends.yml')) {
                genFriendPage(TPL, PUB, DOMAIN);
                return;
            }

            /* ---------- JSON 更新 ---------- */
            if (filePath.endsWith('.json')) {
                const content = fs.readFileSync(filePath, 'utf8').trim();
                if (content) {
                    // 重新统计（因为JSON数据变了）
                    const stats = await collectMusicStats(musics, SRC);
                    genHome(TPL, PUB, musics);
                    musics.forEach(m => genMusicPlay(TPL, PUB, m));
                    genSearchJson(PUB, musics);
                    genAboutPage(TPL, PUB, stats);
                }
                return;
            }

            /* ---------- 模板更新 ---------- */
            if (filePath.endsWith('.ejs')) {
                const tplName = path.basename(filePath);
                const scope = affect[tplName];

                if (scope === 'Home') {
                    genHome(TPL, PUB, musics);
                } 
                else if (scope === 'MusicPlay') {
                    musics.forEach(m => genMusicPlay(TPL, PUB, m));
                } 
                else if (scope === 'Friend') {
                    genFriendPage(TPL, PUB, DOMAIN);
                }
                else if (scope === 'All') {
                    genHome(TPL, PUB, musics);
                    musics.forEach(m => genMusicPlay(TPL, PUB, m));
                    genFriendPage(TPL, PUB, DOMAIN);
                    const stats = await collectMusicStats(musics, SRC);
                    genAboutPage(TPL, PUB, stats);
                }
                else if (scope === 'About') {
                    const stats = await collectMusicStats(musics, SRC);
                    genAboutPage(TPL, PUB, stats);
                }
            }
        } catch (e) {
            logError(`热更新失败: ${e.message}`);
        }
    });
}

/* ------------------ 本地预览 ------------------ */

function startServer() {

    const PUB = path.join(process.cwd(), GLOBAL_CONFIG.public);

    const port = GLOBAL_CONFIG.port || 3000;

    const server = http.createServer((req, res) => {
        return handler(req, res, {
            public: PUB,
            cleanUrls: true,
            directoryListing: false,
            index: ['index.html']
        });
    });

    server.listen(port, '::', () => {
        log(`Server is running at http://localhost:${port}/`);
    });
}

/* ------------------ 入口 ------------------ */

async function main() {

    GLOBAL_CONFIG = loadConfig();

    await buildAll();

    if (process.argv.includes('-s') || process.argv.includes('--serve')) {
        startServer();
        startWatcher();
    }
}

main();
