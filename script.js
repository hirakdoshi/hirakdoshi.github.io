document.addEventListener('DOMContentLoaded', () => {
    /* ---------------------------------------------------------
       Theme toggle (light/dark) — the inline script in <head>
       already applied the saved preference before paint, to
       avoid a flash of the wrong theme. This just wires up the
       click handler and keeps the icon in sync.
    --------------------------------------------------------- */
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const syncIcon = () => {
            const isLight = document.documentElement.classList.contains('light-mode');
            themeToggle.textContent = isLight ? '🌙' : '☀️';
            themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
        };
        syncIcon();

        themeToggle.addEventListener('click', () => {
            const isLight = document.documentElement.classList.toggle('light-mode');
            try {
                localStorage.setItem('site-theme', isLight ? 'light' : 'dark');
            } catch (err) {
                // localStorage unavailable (private browsing, etc.) — toggle still works for this page view
            }
            syncIcon();
        });
    }

    document.getElementById('year').textContent = new Date().getFullYear();

    /* ---------------------------------------------------------
       Mobile nav toggle
    --------------------------------------------------------- */
    const headerToggle = document.getElementById('headerToggle');
    const navWrap = document.getElementById('navWrap');
    if (headerToggle && navWrap) {
        headerToggle.addEventListener('click', () => navWrap.classList.toggle('open'));
    }

    /* ---------------------------------------------------------
       Generic modal helpers
    --------------------------------------------------------- */
    function wireModal(overlayId, closeBtnId) {
        const overlay = document.getElementById(overlayId);
        const closeBtn = document.getElementById(closeBtnId);
        const open = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
        const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return { open, close };
    }

    const paperModal = wireModal('paperModal', 'paperModalClose');
    const puzzleModal = wireModal('puzzleModal', 'puzzleModalClose');

    /* ---------------------------------------------------------
       Photo zoom — click (or Enter/Space) the portrait to enlarge
    --------------------------------------------------------- */
    const photoTrigger = document.getElementById('portraitTrigger');
    if (photoTrigger && document.getElementById('photoModal')) {
        const photoModal = wireModal('photoModal', 'photoModalClose');
        photoTrigger.addEventListener('click', () => photoModal.open());
        photoTrigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                photoModal.open();
            }
        });
    }

    /* ===========================================================
       LATEST RESEARCH
       Three fixed categories, rotated deterministically by date
       (changes automatically every 2-3 days — no backend needed).
       Sources: CrossRef + PubMed (both free, CORS-enabled, no key).
    =========================================================== */
    const CATEGORIES = [
        {
            tag: 'Mathematical Imaging',
            crossrefQuery: 'mathematical imaging inverse problems variational methods optimization functional analysis',
            matchTerms: ['mathematical imaging', 'inverse problem', 'image reconstruction', 'variational method', 'regularization', 'convex optimization', 'functional analysis', 'real analysis', 'operator theory']
        },
        {
            tag: 'Motion & Optical Flow',
            crossrefQuery: 'optical flow motion estimation image sequence variational deep learning',
            matchTerms: ['optical flow', 'motion estimation', 'motion field', 'image registration', 'video frame', 'image sequence']
        },
        {
            tag: 'Diffusion MRI',
            crossrefQuery: 'diffusion MRI fiber tractography deep learning neuroimaging',
            matchTerms: ['diffusion mri', 'diffusion-weighted', 'tractography', 'diffusion tensor', 'dwi', 'neuroimaging', 'prostate']
        }
    ];

    // A "rotation index" that only changes every 3 days, so the same
    // trio of papers holds steady across visits and then advances.
    function rotationIndex() {
        const epoch = new Date('2025-01-01T00:00:00Z').getTime();
        const days = Math.floor((Date.now() - epoch) / 86400000);
        return Math.floor(days / 3);
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function extractYear(item) {
        const parts = (item.published && item.published['date-parts']) ||
                      (item['published-print'] && item['published-print']['date-parts']) ||
                      (item['published-online'] && item['published-online']['date-parts']);
        return parts && parts[0] && parts[0][0];
    }

    function cleanAbstract(raw) {
        const text = raw.replace(/<[^>]+>/g, '').trim();
        // CrossRef abstracts are often JATS-wrapped with a literal
        // "Abstract" title tag; stripping tags leaves it glued to the
        // first sentence (e.g. "AbstractOperator splitting..."). Remove it.
        return text.replace(/^Abstract\s*/i, '').trim();
    }

    function isRelevant(item, matchTerms) {
        const haystack = `${(item.title && item.title[0]) || ''} ${item.abstract || ''}`.toLowerCase();
        return matchTerms.some(term => haystack.includes(term));
    }

    async function fetchCrossrefPaper(category, rotIdx) {
        const currentYear = new Date().getFullYear();
        // Try a handful of offset windows, each time only accepting a result
        // that (a) has a real abstract, (b) falls in a genuinely "recent"
        // window — 2020 or later, not just "not in the future" — and
        // (c) is topically on-target.
        const MIN_YEAR = 2020;
        for (let attempt = 0; attempt < 5; attempt++) {
            const offset = ((rotIdx + attempt) % 10) * 5;
            const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(category.crossrefQuery)}` +
                        `&filter=has-abstract:true,type:journal-article,from-pub-date:${MIN_YEAR}-01-01,until-pub-date:${todayISO()}` +
                        `&sort=relevance&order=desc&rows=5&offset=${offset}`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            const items = data.message.items || [];

            for (const item of items) {
                const year = extractYear(item);
                if (!item.abstract) continue;
                if (!year || year > currentYear || year < MIN_YEAR) continue;
                if (!isRelevant(item, category.matchTerms)) continue;

                return {
                    title: (item.title && item.title[0]) || 'Untitled',
                    authors: (item.author || []).slice(0, 5).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') || 'Authors unavailable',
                    journal: (item['container-title'] && item['container-title'][0]) || item.publisher || 'Unknown venue',
                    year: year,
                    abstract: cleanAbstract(item.abstract),
                    keywords: item.subject || [],
                    url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : '#')
                };
            }
        }
        throw new Error('no qualifying paper found');
    }

    function renderPaperCard(container, category, paper) {
        container.innerHTML = `
            <span class="paper-tag">${category.tag}</span>
            <p class="paper-title">${paper.title}</p>
            <p class="paper-meta">${paper.journal} · ${paper.year}</p>
        `;
        container.classList.remove('paper-skeleton');
        container.addEventListener('click', () => {
            document.getElementById('pmTag').textContent = category.tag;
            document.getElementById('pmTitle').textContent = paper.title;
            document.getElementById('pmAuthors').textContent = paper.authors;
            document.getElementById('pmJournal').textContent = paper.journal;
            document.getElementById('pmYear').textContent = paper.year;
            document.getElementById('pmAbstract').textContent = paper.abstract;
            document.getElementById('pmLink').href = paper.url;
            const kwWrap = document.getElementById('pmKeywords');
            kwWrap.innerHTML = '';
            (paper.keywords || []).slice(0, 6).forEach(k => {
                const span = document.createElement('span');
                span.className = 'chip';
                span.textContent = k;
                kwWrap.appendChild(span);
            });
            paperModal.open();
        });
    }

    async function loadPapers() {
        const listEl = document.getElementById('paperList');
        const cards = listEl.querySelectorAll('.paper-card');
        const rotIdx = rotationIndex();

        for (let i = 0; i < CATEGORIES.length; i++) {
            const category = CATEGORIES[i];
            const card = cards[i];
            try {
                const paper = await fetchCrossrefPaper(category, rotIdx);
                renderPaperCard(card, category, paper);
            } catch (err) {
                card.innerHTML = `
                    <span class="paper-tag">${category.tag}</span>
                    <p class="paper-title">Couldn't reach CrossRef right now.</p>
                    <p class="paper-meta">Refresh to retry</p>
                `;
                card.classList.remove('paper-skeleton');
            }
        }
    }

    loadPapers();

    /* ===========================================================
       LIVE REPO COMMIT COUNT
       GitHub's API has no direct "total commits" endpoint. The
       standard trick: request 1 commit per page, then read the
       last page number from the response's Link header — that
       number equals the total commit count. Public repo, no auth
       needed, but shares GitHub's unauthenticated rate limit
       (60 requests/hour per visitor IP).
    =========================================================== */
    async function loadCommitCount() {
        const el = document.getElementById('commitCount');
        if (!el) return;
        try {
            const res = await fetch('https://api.github.com/repos/being-hd/being-hd.github.io/commits?per_page=1');
            if (!res.ok) throw new Error('github api error');

            const link = res.headers.get('Link');
            let count;
            if (link) {
                const match = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
                count = match ? parseInt(match[1], 10) : null;
            }
            if (!count) {
                // No Link header means everything fit on one page.
                const data = await res.json();
                count = data.length;
            }
            el.textContent = count;
        } catch (err) {
            el.textContent = '—';
        }
    }

    loadCommitCount();

    /* ===========================================================
       GITHUB PROJECTS — real creation dates, newest first
       Pulls each repo's created_at from the public GitHub API
       (same no-auth approach as the commit counter) and sorts
       the cards accordingly, so this never needs manual updates
       when a new repo is added.
    =========================================================== */
    async function loadGithubProjectDates() {
        const grid = document.getElementById('githubProjectsGrid');
        if (!grid) return;

        const tiles = Array.from(grid.querySelectorAll('.info-tile[data-repo]'));

        await Promise.all(tiles.map(async (tile) => {
            const repo = tile.getAttribute('data-repo');
            const dateEl = tile.querySelector('.repo-date');
            try {
                const res = await fetch(`https://api.github.com/repos/being-hd/${repo}`);
                if (!res.ok) throw new Error('github api error');
                const data = await res.json();
                const created = new Date(data.created_at);
                tile.dataset.createdTs = created.getTime();
                if (dateEl) {
                    dateEl.textContent = created.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }
            } catch (err) {
                if (dateEl) dateEl.textContent = '—';
                tile.dataset.createdTs = '0';
            }
        }));

        tiles
            .slice()
            .sort((a, b) => Number(b.dataset.createdTs) - Number(a.dataset.createdTs))
            .forEach((tile) => grid.appendChild(tile));
    }

    loadGithubProjectDates();

    /* ===========================================================
       CHESS PUZZLE — Lichess daily puzzle, solvable in-page
    =========================================================== */
    let puzzleData = null;
    let board = null;
    let game = null;
    let solutionMoves = [];
    let solutionIdx = 0;
    let puzzleColor = 'white';

    function uciToMove(uci) {
        return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
    }

    async function loadDailyPuzzle() {
        const label = document.getElementById('puzzleTurnLabel');
        try {
            const res = await fetch('https://lichess.org/api/puzzle/daily');
            if (!res.ok) throw new Error('puzzle fetch failed');
            const data = await res.json();
            puzzleData = data;

            const pgn = data.game.pgn;
            const initialPly = data.puzzle.initialPly;
            solutionMoves = data.puzzle.solution;

            // Replay the PGN up to initialPly to get the starting FEN for the puzzle.
            const replay = new Chess();
            replay.load_pgn(pgn);
            const history = replay.history({ verbose: true });
            replay.reset();
            for (let i = 0; i <= initialPly; i++) {
                if (history[i]) replay.move(history[i].san);
            }

            game = replay;
            puzzleColor = game.turn() === 'w' ? 'white' : 'black';

            label.innerHTML = `${puzzleColor === 'white' ? 'White' : 'Black'} to move — <span class="side-tag">find the winning line</span>`;
        } catch (err) {
            label.textContent = "Couldn't load today's puzzle. Try again shortly.";
        }
    }

    function setupBoard() {
        if (!game) return;
        solutionIdx = 0;
        const statusEl = document.getElementById('puzzleStatus');
        statusEl.textContent = 'Make your move — drag a piece to begin.';
        statusEl.className = 'puzzle-status';
        document.getElementById('pzTurnLabel').textContent =
            `${puzzleColor === 'white' ? 'White' : 'Black'} to play`;

        if (board) { board.destroy(); }
        board = Chessboard('puzzleBoard', {
            position: game.fen(),
            draggable: true,
            orientation: puzzleColor,
            pieceTheme: 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/{piece}.svg',
            onDrop: handleDrop
        });
    }

    function handleDrop(source, target) {
        if (solutionIdx >= solutionMoves.length) return 'snapback';

        const expected = uciToMove(solutionMoves[solutionIdx]);
        const move = game.move({ from: source, to: target, promotion: 'q' });
        const statusEl = document.getElementById('puzzleStatus');

        if (!move) return 'snapback';

        if (source === expected.from && target === expected.to) {
            solutionIdx++;
            statusEl.textContent = 'Correct!';
            statusEl.className = 'puzzle-status correct';

            if (solutionIdx >= solutionMoves.length) {
                statusEl.textContent = 'Puzzle solved! Nicely done.';
                board.position(game.fen());
                return;
            }

            // Opponent's reply, played automatically.
            setTimeout(() => {
                const replyUci = solutionMoves[solutionIdx];
                if (replyUci) {
                    const reply = uciToMove(replyUci);
                    game.move({ from: reply.from, to: reply.to, promotion: reply.promotion || 'q' });
                    board.position(game.fen());
                    solutionIdx++;
                    if (solutionIdx >= solutionMoves.length) {
                        statusEl.textContent = 'Puzzle solved! Nicely done.';
                        statusEl.className = 'puzzle-status correct';
                    } else {
                        statusEl.textContent = 'Correct — your move again.';
                        statusEl.className = 'puzzle-status correct';
                    }
                }
            }, 350);
        } else {
            game.undo();
            statusEl.textContent = 'Not quite — try another move.';
            statusEl.className = 'puzzle-status wrong';
            return 'snapback';
        }
    }

    document.getElementById('openPuzzleBtn').addEventListener('click', () => {
        puzzleModal.open();
        if (puzzleData) {
            setupBoard();
            document.getElementById('puzzleAnalyzeBtn').href = `https://lichess.org/training/${puzzleData.puzzle.id}`;
        }
    });

    document.getElementById('puzzleResetBtn').addEventListener('click', () => {
        if (!puzzleData) return;
        loadDailyPuzzle().then(setupBoard);
    });

    loadDailyPuzzle();

    /* ===========================================================
       NOTEBOOK — copy-link buttons (replaces per-platform share
       links, which depended on Open Graph scraping that isn't set
       up yet and left LinkedIn/X share dialogs blank)
    =========================================================== */
    async function copyTextToClipboard(text) {
        // Preferred path: the modern Clipboard API. Requires a secure
        // (HTTPS) context, and some privacy-hardened mobile browsers
        // (e.g. Brave's Shields) block it outright even when secure.
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // fall through to the legacy method below
            }
        }

        // Fallback: the old execCommand('copy') trick via a hidden
        // textarea. Deprecated, but still broadly supported and works
        // in several places the Clipboard API is blocked.
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch (err) {
            return false;
        }
    }

    document.querySelectorAll('.copy-link-btn').forEach((btn) => {
        const url = btn.getAttribute('data-share-url');
        const originalLabel = btn.textContent;
        btn.addEventListener('click', async () => {
            const ok = await copyTextToClipboard(url);
            btn.textContent = ok ? 'Copied!' : 'Copy failed — select manually';
            setTimeout(() => { btn.textContent = originalLabel; }, 1800);
        });
    });

    /* ===========================================================
       NOTEBOOK — copy buttons on code blocks
       Auto-injected for every <pre><code> in .article-body, so
       future posts get this for free without extra markup.
    =========================================================== */
    document.querySelectorAll('.article-body pre:not(.output)').forEach((pre) => {
        const codeEl = pre.querySelector('code');
        if (!codeEl) return;

        pre.style.position = 'relative';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = 'Copy';
        pre.appendChild(copyBtn);

        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(codeEl.textContent);
                copyBtn.textContent = 'Copied!';
            } catch (err) {
                copyBtn.textContent = 'Failed';
            }
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
        });
    });

    /* ===========================================================
       NOTEBOOK — reading time estimate
       Computed from the actual rendered word count of .article-body,
       excluding code blocks (code isn't read at prose speed). Uses
       200 wpm, a standard estimate. Recalculates automatically for
       any future post — nothing to maintain per-post.
    =========================================================== */
    const readingTimeEl = document.getElementById('readingTime');
    const articleBody = document.querySelector('.article-body');
    if (readingTimeEl && articleBody) {
        const clone = articleBody.cloneNode(true);
        clone.querySelectorAll('pre').forEach((el) => el.remove());
        const text = clone.textContent || '';
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        const minutes = Math.max(1, Math.round(wordCount / 200));
        readingTimeEl.textContent = `${minutes} min read`;
    }

    /* ===========================================================
       CONTACT MODAL — opens on "Contact me →", submits via
       Formspree AJAX so the page never navigates away.
       Replace FORMSPREE_ENDPOINT with your real form URL from
       formspree.io once you've created a form there.
    =========================================================== */
    const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mdenqeqp';

    const contactTrigger = document.getElementById('contactTrigger');

    const changelogTrigger = document.getElementById('changelogTrigger');
    if (changelogTrigger && document.getElementById('changelogModal')) {
        const changelogModal = wireModal('changelogModal', 'changelogModalClose');
        changelogTrigger.addEventListener('click', () => changelogModal.open());
    }

    if (contactTrigger && document.getElementById('contactModal')) {
        const contactModal = wireModal('contactModal', 'contactModalClose');
        contactTrigger.addEventListener('click', () => contactModal.open());

        const contactForm = document.getElementById('contactForm');
        const statusEl = document.getElementById('contactFormStatus');
        const submitBtn = document.getElementById('contactSubmitBtn');

        if (contactForm) {
            contactForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                statusEl.textContent = 'Sending…';
                statusEl.className = 'form-status sending';
                submitBtn.disabled = true;

                try {
                    const res = await fetch(FORMSPREE_ENDPOINT, {
                        method: 'POST',
                        body: new FormData(contactForm),
                        headers: { Accept: 'application/json' }
                    });

                    if (res.ok) {
                        statusEl.textContent = 'Message sent — thanks, I\'ll get back to you soon.';
                        statusEl.className = 'form-status success';
                        contactForm.reset();
                    } else {
                        statusEl.textContent = 'Something went wrong — try again, or email directly.';
                        statusEl.className = 'form-status error';
                    }
                } catch (err) {
                    statusEl.textContent = 'Network error — check your connection and try again.';
                    statusEl.className = 'form-status error';
                }

                submitBtn.disabled = false;
            });
        }
    }
});
