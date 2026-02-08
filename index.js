const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const ejs = require('ejs');
const chokidar = require('chokidar');
const http = require('http');
const handler = require('serve-handler');

let GLOBAL_CONFIG = {};

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

    console.log('同步静态资源...');

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

        console.log(`复制资源: ${name}`);
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
    console.log(`生成 ${dest}`);
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
            console.warn(`⚠️ 跳过空文件: ${f}`);
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
                files: raw.Files || []
            });
        } catch (e) {
            // 如果 JSON 格式写错了（比如多写了逗号），这里会抓到错误而不让程序崩溃
            console.error(`❌ 文件格式错误，已跳过: ${f} | 原因: ${e.message}`);
        }
    });

    return list;
}

/* ------------------ 页面生成 ------------------ */

function genHome(TPL, PUB, musics) {
    const html = renderTpl(TPL, 'Home', {
        home: musics.map(m => ({
            MusicDir: m.dir,
            MusicImg: m.coverimg.replace('/images/', ''),
            MusicTitle: m.homeTitle
        }))
    });

    writeFile(path.join(PUB, 'index.html'), html);
}

function genMusicPlay(TPL, PUB, music) {

    const html = renderTpl(TPL, 'MusicPlay', {
        music
    });

    const dest = path.join(PUB, music.dir, 'index.html');
    writeFile(dest, html);
}

/* ------------------ 主流程 ------------------ */

async function buildAll() {

    const RUNDIR = process.cwd();

    const SRC = path.join(RUNDIR, GLOBAL_CONFIG.src);
    const DATA_DIR = path.join(SRC, 'Music-data');
    const PUB = path.join(RUNDIR, GLOBAL_CONFIG.public);
    const TPL = path.join(RUNDIR, GLOBAL_CONFIG.template);

    console.log('开始生成音乐空间...');

    ensureDir(PUB);
    cleanDirWithKeep(PUB, GLOBAL_CONFIG.clean?.keep || []);

    syncStaticAssets(SRC, PUB);
    linkApiDir(SRC, PUB);
    const musics = loadMusics(DATA_DIR);

    genHome(TPL, PUB, musics);
    musics.forEach(m => genMusicPlay(TPL, PUB, m));

    console.log('生成完成');
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

        console.log('已创建 api 软连接');

    } catch (e) {
        console.error('创建软连接失败:', e.message);
    }
}

/* ------------------ 热更新 ------------------ */

function startWatcher() {

    const RUNDIR = process.cwd();

    const SRC = path.join(RUNDIR, GLOBAL_CONFIG.src);
    const DATA_DIR = path.join(SRC, 'Music-data');
    const PUB = path.join(RUNDIR, GLOBAL_CONFIG.public);
    const TPL = path.join(RUNDIR, GLOBAL_CONFIG.template);

    const watcher = chokidar.watch([SRC, TPL], {
        ignoreInitial: true
    });

    watcher.on('all', async (event, filePath) => {
        if (!filePath.endsWith('.json') && !filePath.endsWith('.ejs')) {
            syncStaticAssets(SRC, PUB);
        }

        try {
            const musics = loadMusics(DATA_DIR);
            const affect = GLOBAL_CONFIG.templateAffect || {};

            /* ---------- JSON 更新 ---------- */
            if (filePath.endsWith('.json')) {

                const name = path.basename(filePath);
                const raw = JSON.parse(fs.readFileSync(filePath));

                const music = {
                    title: raw.Title,
                    homeTitle: raw.HomeTitle,
                    keywords: raw.Keywords,
                    desc: raw.Description,
                    icon: raw.Icon,
                    bgimg: raw.BgImg,
                    image: raw.OgImg,
                    coverimg: raw.CoverImg,
                    dir: raw.Dir,
                    files: raw.Files
                };

                genMusicPlay(TPL, PUB, music);
                genHome(TPL, PUB, musics);

                return;
            }

            /* ---------- 模板更新 ---------- */
            if (filePath.endsWith('.ejs')) {

                const tplName = path.basename(filePath);

                if (affect[tplName] === 'Home') {
                    genHome(TPL, PUB, musics);
                }
                else if (affect[tplName] === 'MusicPlay') {
                    musics.forEach(m => genMusicPlay(TPL, PUB, m));
                }
                else if (affect[tplName] === 'All') {
                    genHome(TPL, PUB, musics);
                    musics.forEach(m => genMusicPlay(TPL, PUB, m));
                }

                console.log(`模板热更新: ${tplName}`);
            }

        } catch (e) {
            console.error('热更新失败:', e.message);
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
        console.log(`预览地址: http://localhost:${port}/`);
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
