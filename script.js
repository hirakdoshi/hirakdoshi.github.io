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
       Scroll reveal — fade/dissolve sections, cards and rows in
       as they enter the viewport. Adds the .reveal / .is-visible
       classes from style.css at runtime so it works uniformly
       across every page (web, tablet, mobile) with no per-page
       markup changes. Falls back to showing everything instantly
       for prefers-reduced-motion or browsers without
       IntersectionObserver.
    --------------------------------------------------------- */
    function initScrollReveal() {
        const selectors = [
            // A long-form notebook post is one big section.block.article-body
            // wrapping the whole article — too tall to usefully fade in as a
            // single unit, so its direct children (headings, paragraphs,
            // code blocks, images...) are animated individually instead.
            'section.block:not(.article-body)',
            '.article-body > *',
            '.research-block',
            '.equation-block',
            '.puzzle-block',
            '.entry-item',
            '.post-card',
            '.paper-card',
            '.info-tile',
            '.live-card',
            '.kv-row',
            '.month-group'
        ];
        const targets = Array.from(document.querySelectorAll(selectors.join(',')));
        if (!targets.length) return;

        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced || !('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('reveal', 'is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

        const viewportH = window.innerHeight || document.documentElement.clientHeight;

        targets.forEach((el, i) => {
            // Anything already on screen (or a tall block that merely
            // *starts* on screen, like a long article header) should
            // just be there on load — only genuinely below-the-fold
            // content gets the fade-in-on-scroll treatment.
            const rect = el.getBoundingClientRect();
            const alreadyInView = rect.top < viewportH && rect.bottom > 0;

            el.classList.add('reveal');
            if (alreadyInView) {
                el.classList.add('is-visible');
                return;
            }
            el.style.transitionDelay = `${(i % 6) * 60}ms`;
            observer.observe(el);
        });
    }

    initScrollReveal();

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
       TITANIC FACT OF THE DAY
       Hand-curated, paraphrased from published facts on RMS Titanic
       Inc.'s official site (rmstitanicinc.com/titanic-facts) — not
       a live API, same pattern as the equation list above. Rotates
       daily using the same date-based rotation mechanism.
    =========================================================== */
    const TITANIC_FACTS = [
        {
            category: 'Construction',
            title: 'Built in Belfast, by hand',
            fact: "Titanic was built by the shipbuilder Harland & Wolff in Belfast, taking roughly three years from the laying of her keel in 1909 to completion in 1912.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Construction',
            title: 'The largest moving object of her time',
            fact: "At 882 feet long, Titanic was the largest man-made object ever built up to that point — and the largest moving object humans had made.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Construction',
            title: '"Practically" unsinkable, not literally',
            fact: "White Star Line's own promotional material described Titanic as \"practically unsinkable\" — a hedge that popular memory later dropped, turning it into the flat claim everyone now remembers.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Construction',
            title: 'A funnel that did nothing',
            fact: "Titanic had four funnels, but only three actually vented smoke from the boilers. The fourth was added mainly for symmetry and visual grandeur, to make her look as impressive as rival four-funnel liners.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Voyage',
            title: 'No cabin thirteen',
            fact: "No room on Titanic was ever numbered 13, in any class — a deliberate omission driven by superstition around the number.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Voyage',
            title: 'Dragon\'s blood in the cargo hold',
            fact: "Among Titanic's cargo were 76 cases of \"dragon's blood\" — a red resin from a palm tree native to the Canary Islands, used at the time in varnish and cosmetics.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Voyage',
            title: 'A book bound in jewels',
            fact: "One of the more extravagant items on board was a copy of the Rubaiyat of Omar Khayyam, its binding set with over a thousand precious stones.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Voyage',
            title: 'A kosher kitchen at sea',
            fact: "Titanic's kitchens employed a dedicated kosher cook, preparing meals for Jewish passengers and serving them on specially marked dishware.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Disaster',
            title: 'More lifeboats than required, still not enough',
            fact: "Titanic carried 20 lifeboats — more than the 16 required under British regulations at the time — but with a capacity of only around 1,178, far short of the roughly 2,200 people on board.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Disaster',
            title: 'CQD before SOS',
            fact: "Titanic's wireless operators first sent the older distress call \"CQD\" before switching to \"SOS,\" making her sinking one of the earliest widely known uses of the SOS signal at sea.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Disaster',
            title: 'The cold, not the drowning, killed most',
            fact: "The Atlantic water that night was close to -2°C (28°F). Most people who ended up in the water died of hypothermia within minutes, rather than drowning.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Aftermath',
            title: 'A film within a month',
            fact: "Silent-film actress Dorothy Gibson survived the sinking and starred in Saved from the Titanic, released less than a month later — reportedly wearing the same outfit she'd had on the night of the disaster.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Wrecksite',
            title: 'Found 13 miles from where she said she was',
            fact: "When the wreck was located in 1985, it was discovered nearly 13 miles from the coordinates Titanic herself had radioed on the night she sank.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Wrecksite',
            title: 'No skeletons at the bottom',
            fact: "Despite popular assumption, no human remains have ever been found at the wreck site — ocean chemistry and marine life mean skeletal remains don't survive at that depth over a century.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        },
        {
            category: 'Wrecksite',
            title: 'She broke in two, not one',
            fact: "For decades, popular belief — reinforced by early films — held that Titanic sank in one piece. Her 1985 discovery confirmed she had actually broken into two sections as she went down.",
            source: 'https://rmstitanicinc.com/titanic-facts/'
        }
    ];

    function titanicRotationIndex() {
        const epoch = new Date('2025-01-01T00:00:00Z').getTime();
        const days = Math.floor((Date.now() - epoch) / 86400000);
        return days % TITANIC_FACTS.length;
    }

    function loadTitanicFactOfTheDay() {
        const card = document.getElementById('titanicCard');
        if (!card) return;
        const item = TITANIC_FACTS[titanicRotationIndex()];

        card.addEventListener('click', () => {
            document.getElementById('titanicModalTag').textContent = item.category;
            document.getElementById('titanicModalTitle').textContent = item.title;
            document.getElementById('titanicModalBody').textContent = item.fact;
            titanicModal.open();
        });
    }

    const titanicModal = wireModal('titanicModal', 'titanicModalClose');
    loadTitanicFactOfTheDay();

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
       LIVE ELSEWHERE — GitHub & Lichess clickable stat cards
       Fetched lazily on first click, then cached in memory so
       reopening the modal doesn't re-hit the API.
    =========================================================== */
    const GITHUB_USERNAME = 'hirakdoshi';
    const LICHESS_USERNAME = 'margabandhu';

    const LICHESS_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path fill="currentColor" stroke="currentColor" stroke-linejoin="round" d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"/></svg>';

    const CHESS_VARIANTS = [
        { key: 'bullet', label: 'Bullet', icon: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAER0lEQVR4nO2ZT0gUURzHP5uxlw6yglhJJNEpkrwIQUEEnaQ/YKeCCKKwLgURRRFE0CUQpDpFEARR1KGQwEtFBAZFEIQeRTdkRREUD14WpA6/92vevJ3dmVlnVhjnC483b+bt2/nO7/d+/15hduwBmwlbNvoFWo2ccNaRE846csJZR04468gJZx054axj0xHemuLaRWe8zbpeNX01xf8PRBqE+4EBYDvQae51OXMWTL8IzANLQAX4BZRTeKf/aJZwyfSr+KXUD7wHuq17f01fMNeFButWgBngLfABmCNhLYhDuATsBQ4CRxCpXQd+WnMuIGSV5DvgFTBrxrtM3w10AL1mncPW/W4zvgV8N7//AizHeNe6iEq4BxgGTplxGzCNqKSiHziBR3YOeIj/g9jXIPt8J6L6uxCy+4D9COnTpo0Dn4CxgDViISrhTkQSf6x7j/Dvt4N40i0gqjlFrfFSVE0rm2YTUW0aAI4Bh5APcAlR9ec0STwq4d/ASaDdujfnzNnnjCdpTg2L5nc/TXsMHAXOAoPAZUSTngEviGnkCglVLYvAZ0QKKuEKIg3bCoPsZ90KK6aP4qaKwHE84gDfgBHEVkRCUoRLwAR+69wIFet6BnFT+hHmzVogH2cKv6YUgSHEqOkWeorYi7J5XvfDpRl4NEJ3nWsX6qYWgK+I1Z4CniDaM4xIewgxdK7XqEFShNvDpzQFdVMg1hrEYk8ihusGog33EMP2GrhJAxVPKpbuDJ+SGA4jhusHIuElRKUB9gBvkA8Q6B3iSlgXcfeI+tBW4K91PWjaNLBm3b+LhLbXcN41iHARCfTb8QKCXryoCDzLqAaiVWTBC1Ft7DG9TfoiYgDv2xNdwj3AeYRcH7Dbed5m+gX8+6QjxguvFy5ZG234SZ9D/Ph/Kx8k4QlkXywilm8HtcQX3R+1EEESVqw54484wY9LuIw/cilRq9ogMa2NJcIzoaQQVcKjwB13Qj2jpXtz2bQ5xL+55l4NQoXWkG2ENbwtN4rE3TWhbT23FDcH/YU/etoIqHQfIOFnYBwf1S2FfYCVkOetwDQhQQdsXGiZNKaBM0RIGZOsWs4kuFY9BBmsb0jOHCk/TorwKl5hrpEVXQ/sddVAPkXy9DL1Cw0+hKm0Fus0OVD3BP46UxXx36dpDcapzYMjGdowwleRaEVhByCjSLZSNuMJPCkk6ZN1LS0qPMOJnuIgjPAYEoRrxAWerxtEIq4rZvwF2U9a9bDLs+uFEo1d0nERRljrSkXgAP5Eog9R8RJegDKC5KU2miWulcol4CUJlWnXU+LpMb1dLC8Ct5EoZ6f+R4S1tLIBXjnWLe0kgmbyYSVXDnheRdKxMTzj1ot37NJF8DGLlm7ck4zEEZdw1JfRrQCeJdU8e8MO0iD908Oq1WtrNDd1pHk+XHX6KHNTx6Y7EM8JZx054awjJ5x15ISzjpxw1pETzjr+AWBGBGt4X/u6AAAAAElFTkSuQmCC" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'blitz', label: 'Blitz', icon: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAEmElEQVR4nO2bT2gdRRzHPxFh6SFlS2oQSiBCjRBFebb1EijqQQUvmgpSUsEqokIPSluL0pMIrVpUpAj+AQUJeJC0F8VeKgqFYorFQw5aUOGhltKnS3so7xQPvx13376dt/Ob3Z1AzOey783uzsz3zW/m95vfJGPdr9/g/8RNa92B0GwIXu9sCG6RGOgAUcA2hwg9wvuBlxHxa0JIwQnwJ3AQeB2YCtj2f4Qe4R/S6wHgPcTEgxJa8CVgJf38OPAugUc6tODrQC/3fTcy0sFEhxZ8I72O5crmgcOhOrCWfjgvei8ivHVCC95U+G5EbwUWCOCuQgu+DbjLcm8euLftDoQWvAOYGXH/vrY7EFJwBDxc8cwOWg49Qwp+Cnii4plpYLLNTtzcZuU5Ori5ns2W8giYRSzgV+Csb0dCCO4AHzF67hquIcFJnhh4AdiTfj9SpzNtm7QRu9Px+fPIJsMQIWKP5Oq4VKdDbQqeB77AXSzAt4Xvs4jYuKE+tWLSEbLn1Xb0HLBcKHumUIdtjjvT9AjHwAngGPpR+QzoFuoqbh8ngdu9epbSpOAp4GNkr6vlJPB5oWwcuKVQFlMzOGlKcAdYotrPlnEOeAvoOz6/nxrbySYEa1fiPAnwDoOmbNhqeWcGeAXPiKyu4AfRr8R5VvALIvYBj/o0WEdwB/gAt4DCxkUG/S5kI7cFe5gZA6/iYdq+gqeAo8Adnu8bOmSdNkL76ecXGb3S70T20Cp8BS/QTIZiDpmPMdmiNYW4NpcFcA9K9+cTeHSApz3es3EgrfNirv45x3e3I+vIkmtjWsER4hbqmnKROdxF5omBB1AI1pr0JPCQ8p22uRWFWWsF78J9Vf4F+FJZvw/TSFTmhFbw/el1teK5BHEbZ5T1+zCNPUgZQiM4ArYxmE+28SaKeRUSjeBNwATVo3sBWPTukZ4ecNX1YY3gcWSBMNiEf0gWG//NcCTVNJcZTgtZ0Qh2mScXGJy3y8AVRRs+9MjOrCrRCHYxm/MM7ny6wKeKNnxYxn1rqRJ8HTGfPKsMmvYfJe8tYndPCfVM/ipKT6CJtBIGz3aLrCK+t0gXeA7p2D3IOnAZ+AnJMUMWMe1DFxuvAL8pnleHlmUjaOhhH60E+ITBHVGRr5Cs5THcg5tvRrRZijbwOF1x/5+K+30ysfmMRZSWL+E+53/Gw/1pBf8IfF9SbubxlvTqkn7pWz4vIqu9DbNunKA8NTQSreAEeN9yb4Js/jmvmiVcAX633FtFIr2yLKcTPgmAs2mDZdRJ9xj6wF+FMjOqY4jZv43nj+ojOEkbLDPtXTRzvrstvRbd3nfAS3iYssE3xdNFznuLonfjt5HPY/vBTqVteosFf8ERmeiTZP55AniMeqM8C9xJNrI94DXgWWqKBX/BZv50kYPu58lGey/yQ/hgUkgziNBTwJPAcRrahDRxemj85zKSzXwEOITslDR74hg5C74bsZrTyDFMnRV/iKaOS42JH0f86AKSHUlwP1kYR0LTM2QZzMZpSnB+FLrIH41OIlvKCLdR6tLAHK2irb/x6BNIgJaN/3lY72wIXu/8C/7B0oCx4ZP2AAAAAElFTkSuQmCC" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'rapid', label: 'Rapid', icon: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAEwklEQVR4nO3aXYhVVRQH8J/RS+klx490yKHChhJSJFCwhKAIDFQwCSRiHoISMYiKPogggl6CXvoQKd9ESDARLCyKBMEKjErwoWKYShQ0P4vRXqeHdS73zvWemfOx7xjT/OFwztl7n732/6y9115rnTPr1KG3/J9ww/UewFRjhvB0xwzh6Y4br/cAMgxiDRrZ/UkcwWhqQdeTcAMP4nGsRD9uxj/4DudwLLXQ60G4SfRpPIzZXdrM65XwqSY8iNexWXeip/Ej9uuBdplao7Uen2BId7JwCSNiFgyJF5QUU6Xh9diJJZO0W4Gl4oVcFeQ/wm6JDNhUaLgo2SZmt51X4G1sSjWYlBpuYE52wBUM4BXFyXbDiJjqSZCCcAPLsAWrOuruUI1s03h9ie8lNGB1CQ9im9hL62gRLuBbLZI/+485Hs0tZqjmGC7gEPbpkXfVjqqE+7X206poanQXPqvRTylUIdzAS/KdhyI4KqxvzzXaiSqEN+FJLbJX8Rv6FFvHJ/AUhivIro2y+/AgXsTC7P6qcAw2Z8fRdEPrDcoSfkI4A01cxl6hrWPZ9WRYLix7f0nZSVBmSjfwWEdZH26tIPd5sWfvFbEvEQ5eFg7LFT1a22UIL3OtVmaLMO+cIL61RH9rs4Ow2HAmO/8uPKwR8UJ+aKurhTKE8zS5Efdn1wsqjmNBx3l5W90F/CJmQ+0gIlXwsEB1skX6XosPsqNWyFiG8K8STasaGMI7apAuQ3hYbEHnqwpLhI1qkC7reOwQjv0WkY+ap37QUAUb8ReeVXJNV/G0jmVHv4h3V+EZ4/fnqcCQ8PDeLPNQHaN1RhDfga9r9FMH27G6zAOprPRIon7KYqEgXRipUjwnRZaiaPDwt0jbzMM96m1pjwotF8qKpCJ8rkCbE/hQZDTOZmVztOzAVuMdjqJYKEhPKeHLQmN5Gj6N11wb6I9q7e1LhSGsou0HhK8/qcVORfgs/pBvqfcZT3YQd+MhQXSeSPjdVFH+fcLXn1TLqQiPyjdcV3G47X676tM3D/OxuEjDlHnpPMKXtdb4eryqN87K3CKNUn55yFs/lwRp0qRz89CYvElaDd85Qd2V7Dw3obxOPCem9scmyJel1PAtBdr00kEZFG7meyYILFIRbuDeCeqb35sO6220NYZ1eDmvQSrCc7Aop+5PrSl9BHsSyezEWNv1EjlrOiXh27qUnxcEm87FqPh0ujuR3CbGcq6vQSqj1ZdT/jkOdJQNi63pokjoL+x8qCAuZuf5mGU80Z1ydo1UhBdngjsHtD9H8Bm8geOC9ErliR/Ap9ggfpJp4l0czHsoBeH+TGgn3u8iuCFeTl92buCbrO6RknKPZ/0fFFa5D6dMknerSni1sIYD4u12bgNf4SeRihkQGrw9q1uktd47Z0URjIkp3P5s4e9UVQg3k2h3ZYI7BzIsvjFtE2FfFVJ5aF+na6p0UMVKbxBkmwNoHrPEut0jtLpOGrLtMtrLmuFkKVQhfDynfFgYol3Z/cWcdmXQfJHdMKK1vxdGlSm9WxiHAS0NXjT+55MXBPHFwn/Oc+zbLXi3AL79ufmZTJn8L7q0nxRVCI+awOy3tenJr4N18b/7X3qG8HTHDOHpjhnC0x3/AtWh6T3xBybpAAAAAElFTkSuQmCC" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'classical', label: 'Classical', icon: '<img src="data:image/png;base64,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" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'antichess', label: 'Antichess', icon: '<img src="data:image/png;base64,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" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'atomic', label: 'Atomic', icon: '<img src="data:image/png;base64,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" alt="" style="width:100%;height:100%;object-fit:contain;">' },
        { key: 'puzzle', label: 'Puzzles', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>' }
    ];

    function initLiveCards() {
        const githubCard = document.getElementById('githubCard');
        const chessCard = document.getElementById('chessCard');
        if (!githubCard && !chessCard) return;

        const githubModal = wireModal('githubModal', 'githubModalClose');
        const chessModal = wireModal('chessModal', 'chessModalClose');

        let githubLoaded = false;
        let chessLoaded = false;

        if (githubCard) {
            githubCard.addEventListener('click', async () => {
                githubModal.open();
                if (githubLoaded) return;
                const body = document.getElementById('githubModalBody');
                try {
                    const [userRes, reposRes] = await Promise.all([
                        fetch(`https://api.github.com/users/${GITHUB_USERNAME}`),
                        fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`)
                    ]);
                    if (!userRes.ok) throw new Error('GitHub API error');
                    const data = await userRes.json();
                    const repos = reposRes.ok ? await reposRes.json() : [];

                    const memberSince = new Date(data.created_at).getFullYear();
                    const yearsOnGithub = new Date().getFullYear() - memberSince;

                    const langCounts = {};
                    repos.forEach(r => {
                        let lang = r.language;
                        if (!lang) return;
                        if (lang === 'Jupyter Notebook') lang = 'Python'; // notebooks are essentially Python
                        langCounts[lang] = (langCounts[lang] || 0) + 1;
                    });
                    const topLanguage = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a])[0] || '—';

                    let commitCount = '—';
                    try {
                        const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_USERNAME}.github.io/commits?per_page=1`);
                        if (commitRes.ok) {
                            const link = commitRes.headers.get('Link');
                            const match = link ? link.match(/[?&]page=(\d+)>;\s*rel="last"/) : null;
                            commitCount = match ? match[1] : '1';
                        }
                    } catch (e) { /* leave as — */ }

                    const ICON_REPO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/></svg>';
                    const ICON_COMMIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="12" x2="8" y2="12"/><circle cx="12" cy="12" r="4"/><line x1="16" y1="12" x2="22" y2="12"/></svg>';
                    const ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>';
                    const ICON_CODE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 6 3 12 8 18"/><polyline points="16 6 21 12 16 18"/></svg>';

                    body.innerHTML = `
                        <div class="modal-profile-header">
                            <img class="modal-profile-avatar" src="${data.avatar_url}" alt="" style="object-fit:cover;">
                            <div class="modal-profile-name">${data.name || data.login}</div>
                            <div class="modal-profile-meta">@${data.login}</div>
                        </div>
                        <div class="stat-tile-grid">
                            <div class="stat-tile"><span class="stat-tile-icon">${ICON_REPO}</span><span class="stat-tile-value">${data.public_repos}</span><span class="stat-tile-label">Public repos</span></div>
                            <div class="stat-tile"><span class="stat-tile-icon">${ICON_COMMIT}</span><span class="stat-tile-value">${commitCount}</span><span class="stat-tile-label">Commits to this site</span></div>
                            <div class="stat-tile"><span class="stat-tile-icon">${ICON_CALENDAR}</span><span class="stat-tile-value">${yearsOnGithub}</span><span class="stat-tile-label">Years on GitHub</span></div>
                            <div class="stat-tile"><span class="stat-tile-icon">${ICON_CODE}</span><span class="stat-tile-value" style="font-size:16px;">${topLanguage}</span><span class="stat-tile-label">Top language</span></div>
                        </div>
                    `;
                    githubLoaded = true;
                } catch (err) {
                    body.innerHTML = `<p class="live-modal-error">Couldn't reach GitHub right now. <a href="https://github.com/${GITHUB_USERNAME}" target="_blank" rel="noopener">View profile directly →</a></p>`;
                }
            });
        }

        if (chessCard) {
            chessCard.addEventListener('click', async () => {
                chessModal.open();
                if (chessLoaded) return;
                const body = document.getElementById('chessModalBody');
                try {
                    const res = await fetch(`https://lichess.org/api/user/${LICHESS_USERNAME}`);
                    if (!res.ok) throw new Error('Lichess API error');
                    const data = await res.json();
                    const perfs = data.perfs || {};

                    const rows = CHESS_VARIANTS.map(v => {
                        const p = perfs[v.key];
                        if (!p || !p.games) return '';
                        const provisional = p.prov ? '<span class="prov">?</span>' : '';
                        return `
                            <div class="stat-tile">
                                <span class="stat-tile-icon">${v.icon}</span>
                                <span class="stat-tile-value">${p.rating}${provisional}</span>
                                <span class="stat-tile-label">${v.label}</span>
                            </div>
                        `;
                    }).join('');

                    body.innerHTML = `
                        <div class="modal-profile-header">
                            <div class="modal-profile-avatar">${LICHESS_LOGO_SVG}</div>
                            <div class="modal-profile-name">${data.username}</div>
                            <div class="modal-profile-meta">${data.count && data.count.all ? data.count.all + ' games played' : 'Lichess profile'}</div>
                        </div>
                        <div class="stat-tile-grid">${rows || '<p class="live-modal-error">No rated games yet in these variants.</p>'}</div>
                        <a class="btn" href="https://lichess.org/@/${LICHESS_USERNAME}" target="_blank" rel="noopener" style="margin-top:18px;display:block;width:fit-content;margin-left:auto;margin-right:auto;">View profile →</a>
                    `;
                    chessLoaded = true;
                } catch (err) {
                    body.innerHTML = `<p class="live-modal-error">Couldn't reach Lichess right now. <a href="https://lichess.org/@/${LICHESS_USERNAME}" target="_blank" rel="noopener">View profile directly →</a></p>`;
                }
            });
        }
    }

    initLiveCards();

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
