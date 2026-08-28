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
        headerToggle.addEventListener('click', () => {
            const opening = !navWrap.classList.contains('open');
            if (opening && window.scrollY > 0) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            navWrap.classList.toggle('open');
        });
    }

    /* ---------------------------------------------------------
       Generic modal helpers
    --------------------------------------------------------- */
    function wireModal(overlayId, closeBtnId) {
        const overlay = document.getElementById(overlayId);
        const closeBtn = document.getElementById(closeBtnId);
        if (!overlay || !closeBtn) return { open: () => {}, close: () => {} };
        const open = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
        const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return { open, close };
    }

    const paperModal = wireModal('paperModal', 'paperModalClose');
    const puzzleModal = wireModal('puzzleModal', 'puzzleModalClose');
    const equationModal = wireModal('equationModal', 'equationModalClose');

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
        const card = cards[0];
        if (!card) return;

        const rotIdx = rotationIndex();
        const category = CATEGORIES[rotIdx % CATEGORIES.length];

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

        // Older/unmigrated pages may still have extra skeleton cards
        // in the markup — drop anything beyond the first so nothing
        // is left stuck on "Loading…".
        for (let i = 1; i < cards.length; i++) {
            cards[i].remove();
        }
    }

    loadPapers();

    /* ===========================================================
       EQUATION / PROOF OF THE DAY
       A hand-picked list of results spanning the fields relevant
       to Hirak's work — real/functional analysis, variational
       methods, PDEs, linear algebra, optimization, probability.
       Rotates deterministically by date (same mechanism as the
       paper feed), rendered client-side with KaTeX.
    =========================================================== */
    const EQUATIONS = [
        {
            field: 'Linear Algebra',
            title: 'Cauchy–Schwarz Inequality',
            teaser: 'The inner product of two vectors is bounded by the product of their lengths.',
            statement: 'For all vectors \\(x, y\\) in an inner product space \\(V\\): \\[ |\\langle x, y \\rangle| \\le \\|x\\|\\,\\|y\\| \\]',
            proof: 'For any real \\(t\\), \\(0 \\le \\|x - ty\\|^2 = \\|x\\|^2 - 2t\\langle x,y\\rangle + t^2\\|y\\|^2\\). This is a quadratic in \\(t\\) that is always non-negative, so its discriminant satisfies \\(4\\langle x,y\\rangle^2 - 4\\|x\\|^2\\|y\\|^2 \\le 0\\), which is exactly the inequality.'
        },
        {
            field: 'Real Analysis',
            title: 'Banach Fixed Point Theorem',
            teaser: 'A contraction on a complete space always has exactly one fixed point.',
            statement: 'If \\((X,d)\\) is a complete metric space and \\(T:X\\to X\\) satisfies \\(d(Tx,Ty) \\le k\\,d(x,y)\\) for some \\(k<1\\), then \\(T\\) has a unique fixed point.',
            proof: 'Starting from any \\(x_0\\), define \\(x_{n+1} = Tx_n\\). Since \\(d(x_{n+1},x_n) \\le k^n d(x_1,x_0)\\), the sequence is Cauchy and so converges to some \\(x^*\\) by completeness. Continuity of \\(T\\) gives \\(Tx^* = x^*\\). If \\(y^*\\) is another fixed point, \\(d(x^*,y^*) \\le k\\,d(x^*,y^*)\\) forces \\(d(x^*,y^*)=0\\).'
        },
        {
            field: 'Variational Methods',
            title: 'Euler–Lagrange Equation',
            teaser: 'The equation any minimizer of an energy functional must satisfy.',
            statement: 'If \\(u\\) minimizes \\(J(u) = \\int_\\Omega F(x,u,\\nabla u)\\,dx\\), then \\(u\\) satisfies \\[ \\frac{\\partial F}{\\partial u} - \\nabla\\cdot\\frac{\\partial F}{\\partial \\nabla u} = 0 \\] throughout \\(\\Omega\\).',
            proof: 'For a test function \\(\\varphi\\) vanishing on \\(\\partial\\Omega\\), let \\(g(\\varepsilon) = J(u+\\varepsilon\\varphi)\\). Since \\(u\\) minimizes \\(J\\), \\(g\'(0) = 0\\), and integrating by parts along with the fundamental lemma of the calculus of variations gives the equation above.'
        },
        {
            field: 'Optimization',
            title: 'First-Order Optimality Condition',
            teaser: 'At a local minimum, the gradient of a smooth function must vanish.',
            statement: 'If \\(f:\\mathbb{R}^n\\to\\mathbb{R}\\) is differentiable and \\(x^*\\) is a local minimizer, then \\(\\nabla f(x^*) = 0\\).',
            proof: 'If \\(\\nabla f(x^*) \\ne 0\\), moving in the direction \\(d = -\\nabla f(x^*)\\) gives \\(f(x^*+td) = f(x^*) - t\\|\\nabla f(x^*)\\|^2 + o(t)\\), which is smaller than \\(f(x^*)\\) for small \\(t>0\\) — contradicting local minimality.'
        },
        {
            field: 'Functional Analysis',
            title: 'Riesz Representation Theorem',
            teaser: 'Every bounded linear functional on a Hilbert space comes from an inner product.',
            statement: 'For every bounded linear functional \\(\\phi\\) on a Hilbert space \\(H\\), there is a unique \\(y \\in H\\) such that \\(\\phi(x) = \\langle x, y \\rangle\\) for all \\(x \\in H\\).',
            proof: 'Let \\(N = \\ker\\phi\\). If \\(N = H\\), take \\(y=0\\). Otherwise pick a unit vector \\(z\\) orthogonal to \\(N\\); every \\(x\\) satisfies \\(x - \\frac{\\phi(x)}{\\phi(z)}z \\in N\\), and taking an inner product with \\(z\\) gives the representation with \\(y = \\overline{\\phi(z)}\\,z\\).'
        },
        {
            field: 'PDEs',
            title: 'Uniqueness for the Heat Equation',
            teaser: 'A heat equation with fixed boundary and initial data has at most one solution.',
            statement: 'On a bounded domain \\(\\Omega\\), the problem \\(u_t = \\Delta u\\) with \\(u=0\\) on \\(\\partial\\Omega\\) and given initial data has at most one solution.',
            proof: 'If \\(u_1, u_2\\) are two solutions, let \\(w = u_1 - u_2\\) and \\(E(t) = \\int_\\Omega w^2\\,dx\\). Then \\(E\'(t) = -2\\int_\\Omega |\\nabla w|^2\\,dx \\le 0\\), so \\(E\\) is non-increasing from \\(E(0)=0\\), forcing \\(w \\equiv 0\\).'
        },
        {
            field: 'Probability',
            title: 'Markov\'s Inequality',
            teaser: 'A simple bound on how likely a non-negative random variable is to be large.',
            statement: 'For a non-negative random variable \\(X\\) and \\(a>0\\): \\[ P(X \\ge a) \\le \\frac{E[X]}{a} \\]',
            proof: 'Since \\(E[X] \\ge \\int_a^\\infty x f(x)\\,dx \\ge a\\,P(X\\ge a)\\), dividing both sides by \\(a\\) gives the result.'
        },
        {
            field: 'Real Analysis',
            title: 'Dominated Convergence Theorem',
            teaser: 'A pointwise limit under an integrable bound can be pulled inside the integral.',
            statement: 'If \\(f_n \\to f\\) almost everywhere and \\(|f_n| \\le g\\) for some integrable \\(g\\), then \\(\\int f_n\\,d\\mu \\to \\int f\\,d\\mu\\).',
            proof: 'Applying Fatou\'s lemma to \\(g-f_n\\) and to \\(g+f_n\\), and combining the two resulting inequalities, forces \\(\\limsup \\int f_n \\le \\int f \\le \\liminf \\int f_n\\) — so the limit exists and equals \\(\\int f\\).'
        },
        {
            field: 'Optimization',
            title: 'Convexity Implies Global Minimum',
            teaser: 'For a convex function, any critical point is automatically the global minimum.',
            statement: 'If \\(f:\\mathbb{R}^n\\to\\mathbb{R}\\) is convex and differentiable, any critical point of \\(f\\) is a global minimizer.',
            proof: 'Convexity gives \\(f(y) \\ge f(x) + \\nabla f(x)\\cdot(y-x)\\) for all \\(x,y\\). At a critical point \\(x^*\\), \\(\\nabla f(x^*)=0\\), so \\(f(y) \\ge f(x^*)\\) for every \\(y\\).'
        },
        {
            field: 'Linear Algebra',
            title: 'Spectral Theorem for Symmetric Matrices',
            teaser: 'Every real symmetric matrix can be diagonalized by an orthogonal change of basis.',
            statement: 'Every real symmetric matrix \\(A\\) can be written as \\(A = Q\\Lambda Q^{T}\\) for some orthogonal matrix \\(Q\\) and diagonal matrix \\(\\Lambda\\).',
            proof: 'By induction on \\(n\\): a symmetric matrix always has a real eigenvalue \\(\\lambda_1\\) with a unit eigenvector \\(v_1\\); extending \\(v_1\\) to an orthonormal basis reduces \\(A\\) to block form, and the inductive hypothesis applies to the remaining block.'
        }
    ];

    function equationRotationIndex() {
        const epoch = new Date('2025-01-01T00:00:00Z').getTime();
        const days = Math.floor((Date.now() - epoch) / 86400000);
        return days % EQUATIONS.length;
    }

    // Renders a string containing plain text mixed with inline
    // \( ... \) and display \[ ... \] KaTeX delimiters. This lets
    // math sit inside ordinary sentences that wrap naturally at
    // any screen width — no manual line breaks, no overflow.
    function renderMixedMath(el, html) {
        el.innerHTML = html;
        if (window.renderMathInElement) {
            renderMathInElement(el, {
                delimiters: [
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    }

    function loadEquationOfTheDay() {
        const card = document.getElementById('equationCard');
        if (!card) return;
        const eq = EQUATIONS[equationRotationIndex()];

        document.getElementById('eqField').textContent = eq.field;
        document.getElementById('eqTitle').textContent = eq.title;
        const teaserEl = document.getElementById('eqStatementPreview');
        if (teaserEl) teaserEl.textContent = eq.teaser;

        card.addEventListener('click', () => {
            document.getElementById('eqmField').textContent = eq.field;
            document.getElementById('eqmTitle').textContent = eq.title;
            renderMixedMath(document.getElementById('eqmStatement'), eq.statement);
            renderMixedMath(document.getElementById('eqmProof'), eq.proof);
            equationModal.open();
        });
    }

    loadEquationOfTheDay();

    /* ===========================================================
       NOTEBOOK — TAG FILTER
       Only runs on pages with a #tagFilterBar element (i.e. the
       Notebook listing page). Tags are discovered dynamically from
       whatever .post-tag values already exist on the page, so this
       needs no changes when new categories get added later.
    =========================================================== */
    function initTagFilters() {
        const container = document.getElementById('tagFilterBar');
        if (!container) return;

        const cards = Array.from(document.querySelectorAll('.post-card'));
        const tags = new Set();
        cards.forEach(card => {
            const tagEl = card.querySelector('.post-tag');
            if (tagEl) tags.add(tagEl.textContent.trim());
        });

        // No point showing a filter bar for a single category.
        if (tags.size <= 1) return;

        function makePill(label, isActive) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-pill' + (isActive ? ' active' : '');
            btn.textContent = label;
            btn.addEventListener('click', () => applyFilter(label, btn));
            return btn;
        }

        function applyFilter(label, activeBtn) {
            container.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
            activeBtn.classList.add('active');

            cards.forEach(card => {
                const tagEl = card.querySelector('.post-tag');
                const matches = label === 'All' || (tagEl && tagEl.textContent.trim() === label);
                card.style.display = matches ? '' : 'none';
            });

            // Hide a month's whole section header if nothing in it matches.
            document.querySelectorAll('.month-group').forEach(group => {
                const anyVisible = Array.from(group.querySelectorAll('.post-card'))
                    .some(c => c.style.display !== 'none');
                group.style.display = anyVisible ? '' : 'none';
            });
        }

        container.appendChild(makePill('All', true));
        Array.from(tags).sort().forEach(tag => container.appendChild(makePill(tag, false)));
    }

    initTagFilters();

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
            const res = await fetch('https://api.github.com/repos/hirakdoshi/hirakdoshi.github.io/commits?per_page=1');
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
                const res = await fetch(`https://api.github.com/repos/hirakdoshi/${repo}`);
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
            showNotation: false,
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
