// ============================================================
// AI OS - 什亭之匣 登录界面 (React)
// 登录（系统 aiuser） + 分步对话初始化向导
// 纯本地运行：React/ReactDOM/Babel 从 vendor 加载，无外网依赖
// ============================================================
/* global React, ReactDOM */

const { useState, useEffect, useRef } = React;

// ─── 本地存储键 ─────────────────────────────────────────
const KEY_USER = "aios_user";

function readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
}

// ─── 逐字输出组件（带颜色分段） ──────────────────────────
const CN_PUNCT = new Set(["，", "。", "？", "！"]);
const CN_PUNCT_DELAY = 300;

function TypeMsg({ text, onDone, speed = 60 }) {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (n >= text.length) { onDone && onDone(); return; }
        let delay = speed;
        const ch = text[n];
        if (ch === '\n') {
            // 检查换行后的行内容是否为空
            const nextStart = n + 1;
            const nextNl = text.indexOf('\n', nextStart);
            const lineContent = nextNl === -1 ? text.slice(nextStart) : text.slice(nextStart, nextNl);
            if (lineContent !== '') delay = 500;
        } else if (CN_PUNCT.has(ch)) {
            delay = CN_PUNCT_DELAY;
        }
        const t = setTimeout(() => setN((v) => v + 1), delay);
        return () => clearTimeout(t);
    }, [n, text, onDone, speed]);
    return <span>{text.slice(0, n)}</span>;
}

// 带颜色分段和换行的逐字输出（"..." + 换行 + "正在连接什亭之匣······"）
function ConnectingFullMsg({ onDone, speed = 60 }) {
    const prefix = "...\n正在连接";
    const colored = "什亭之匣......";
    const full = prefix + colored;
    const prefixLen = prefix.length;
    const coloredEnd = prefixLen + colored.length;
    const [started, setStarted] = useState(false);
    const [n, setN] = useState(0);
    // 进入页面先等待1秒
    useEffect(() => {
        const t = setTimeout(() => setStarted(true), 1000);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        if (!started) return;
        if (n >= full.length) { onDone?.(); return; }
        let delay = speed;
        const ch = full[n];
        if (ch === '\n') {
            const nextStart = n + 1;
            const nextNl = full.indexOf('\n', nextStart);
            const lineContent = nextNl === -1 ? full.slice(nextStart) : full.slice(nextStart, nextNl);
            if (lineContent !== '') delay = 500;
        } else if (CN_PUNCT.has(ch)) {
            delay = CN_PUNCT_DELAY;
        }
        const t = setTimeout(() => setN((v) => v + 1), delay);
        return () => clearTimeout(t);
    }, [started, n, full, onDone, speed]);
    if (!started) return <span></span>;
    const shown = full.slice(0, n);
    const chars = [];
    for (let i = 0; i < shown.length; i++) {
        if (shown[i] === '\n') {
            chars.push(<br key={i} />);
        } else if (i >= prefixLen && i < coloredEnd) {
            chars.push(<span key={i} style={{color: "#FF3F3F"}}>{shown[i]}</span>);
        } else {
            chars.push(<span key={i}>{shown[i]}</span>);
        }
    }
    return <span>{chars}</span>;
}

// 验证成功逐字输出（带换行）
function SuccessMsg({ onDone, speed = 60 }) {
    const username = ""; // 占位符在"老师"前面，默认为空
    const text = "......\n\n连接密码验证成功。\n当前连接人员信息为${username}老师，已确认。";
    const resolved = text.replace(/\$\{username\}/g, username);
    const [n, setN] = useState(0);
    useEffect(() => {
        if (n >= resolved.length) { onDone?.(); return; }
        let delay = speed;
        const ch = resolved[n];
        if (ch === '\n') {
            const nextStart = n + 1;
            const nextNl = resolved.indexOf('\n', nextStart);
            const lineContent = nextNl === -1 ? resolved.slice(nextStart) : resolved.slice(nextStart, nextNl);
            if (lineContent !== '') delay = 500;
        } else if (CN_PUNCT.has(ch)) {
            delay = CN_PUNCT_DELAY;
        }
        const t = setTimeout(() => setN((v) => v + 1), delay);
        return () => clearTimeout(t);
    }, [n, resolved, onDone, speed]);
    const shown = resolved.slice(0, n);
    const chars = [];
    for (let i = 0; i < shown.length; i++) {
        if (shown[i] === '\n') chars.push(<br key={i} />);
        else chars.push(<span key={i}>{shown[i]}</span>);
    }
    return <span>{chars}</span>;
}

// ─── 系统默认密码 ───────────────────────────────────────
const DEFAULT_PASS = "We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho.";

// ─── API 调用 ─────────────────────────────────────────
const AUTH_API = "http://localhost:8080/api/auth";
const SETUP_API = "http://localhost:8080/api/setup";

async function callAuth(kind, password) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(`${AUTH_API}/${kind}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        return { ok: r.ok, code: r.status };
    } catch (e) {
        return { ok: null, code: -1 };
    }
}

async function callSetupNext(answer) {
    try {
        const r = await fetch(`${SETUP_API}/next`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer }),
        });
        return await r.json();
    } catch (e) {
        return { error: e.message };
    }
}

async function callSetupStatus() {
    try {
        const r = await fetch(`${SETUP_API}/status`);
        return await r.json();
    } catch (e) {
        return { error: e.message };
    }
}

// ─── 登录 ───────────────────────────────────────────────
function LoginScreen({ onLogin }) {
    const [pass, setPass] = useState("");
    const [err, setErr] = useState("");
    const [phase, setPhase] = useState("connecting");  // "connecting" | "prompt" | "input" | "hiding" | "result" | "clearing"
    const [outcome, setOutcome] = useState(null);
    const [promptKey, setPromptKey] = useState(0);
    const inputRef = useRef(null);

    // 阶段切换时重置
    useEffect(() => {
        if (phase === "prompt") { setPromptKey((k) => k + 1); }
    }, [phase]);

    const submit = async () => {
        setPhase("hiding");
        setErr("");
        const auth = await callAuth("login", pass);
        const ok = (auth.ok === true) || (auth.ok === null && pass === DEFAULT_PASS);
        const isDefault = (pass === DEFAULT_PASS);
        setOutcome({ ok, isDefault });
        setPhase("result");
    };

    if (phase === "clearing") return null;
    if (phase === "result" && outcome) {
        if (outcome.ok) {
            return (
                <div className="verify-text">
                    <SuccessMsg onDone={() => {
                        setTimeout(() => {
                            setPhase("clearing");
                            setTimeout(() => onLogin(outcome.isDefault), 500);
                        }, 1000);
                    }} />
                </div>
            );
        }
        return (
            <div className="verify-text">
                <TypeMsg
                    text="连接密码验证失败。"
                    onDone={() => {
                        setTimeout(() => {
                            setPhase("clearing");
                            setPass("");
                            setOutcome(null);
                            setTimeout(() => setPhase("prompt"), 500);
                        }, 1000);
                    }}
                />
            </div>
        );
    }
    if (phase === "hiding") return null;
    if (phase === "connecting") {
        return (
            <div className="verify-text">
                <ConnectingFullMsg onDone={() => {
                    setTimeout(() => {
                        setPhase("clearing");
                        setTimeout(() => setPhase("prompt"), 500);
                    }, 1000);
                }} />
            </div>
        );
    }
    if (phase === "prompt") {
        return (
            <div className="verify-text">
                <TypeMsg key={promptKey} text="请输入系统连接密码。" onDone={() => {
                    setTimeout(() => {
                        setPhase("clearing");
                        setTimeout(() => {
                            setPhase("input");
                            setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 50);
                        }, 500);
                    }, 1000);
                }} />
            </div>
        );
    }

    return (
        <div className="login-card" onClick={(e) => e.stopPropagation()}>
            <div className="login-inline">
                <div className="field">
                    <input ref={inputRef} type="password" placeholder="密码" value={pass} autoFocus
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        onChange={(e) => { setPass(e.target.value); setErr(""); }} />
                </div>
                <button className="login-round" onClick={submit} aria-label="登录">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="M13 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
            {err && <div className="err">{err}</div>}
        </div>
    );
}

// ─── 询问是否更改默认密码 ───────────────────────────────
function PromptScreen({ isDefault, onYes, onNo }) {
    return (
        <div className="login-card">
            <h1 className="login-title">什亭之匣</h1>
            <p className="login-sub">
                欢迎回来。{isDefault ? "检测到仍在用默认密码，是否现在更改？" : "是否设置一个新密码？"}
            </p>
            <div className="prompt-btns">
                <button className="login-btn primary" onClick={onYes}>是，立即更改</button>
                <button className="login-btn ghost" onClick={onNo}>否，稍后再说</button>
            </div>
        </div>
    );
}

// ─── 首次登录改密 ───────────────────────────────────────
function ChangePwdScreen({ onDone }) {
    const [p1, setP1] = useState("");
    const [p2, setP2] = useState("");
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!p1) return setErr("请输入新密码");
        if (p1 !== p2) return setErr("两次新密码不一致");
        setBusy(true);
        setErr("");
        const auth = await callAuth("password", p1);
        if (auth.ok === true) { setBusy(false); onDone(); return; }
        if (auth.ok === false) { setBusy(false); setErr("密码修改失败"); return; }
        setBusy(false);
        onDone();
    };

    return (
        <div className="login-card">
            <h1 className="login-title">首次登录</h1>
            <p className="login-sub">请设置为您的新密码</p>
            <div className="field">
                <label>新密码</label>
                <input type="password" value={p1} autoFocus
                    onChange={(e) => { setP1(e.target.value); setErr(""); }} />
            </div>
            <div className="field">
                <label>确认新密码</label>
                <input type="password" value={p2}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    onChange={(e) => { setP2(e.target.value); setErr(""); }} />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="login-btn primary" onClick={submit} disabled={busy}>{busy ? "设置中…" : "设置新密码"}</button>
        </div>
    );
}

// ─── 分步对话初始化向导 ─────────────────────────────────
function SetupWizard({ onDone, onSkip }) {
    const [step, setStep] = useState(0);
    const [question, setQuestion] = useState(null);
    const [inputVal, setInputVal] = useState("");
    const [history, setHistory] = useState([]);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [summary, setSummary] = useState("");
    const [error, setError] = useState("");
    const inputRef = useRef(null);
    const chatRef = useRef(null);

    // 获取下一个问题
    const fetchNext = async (answer) => {
        setBusy(true);
        setError("");
        try {
            const result = await callSetupNext(answer);
            if (result.error) throw new Error(result.error);
            if (result.done) {
                setDone(true);
                setSummary(result.summary || "配置完成！");
                setTimeout(() => onDone(), 2000);
            } else {
                setQuestion(result);
                if (result.type === "select" && result.options) {
                    // select 类型不需要输入框
                }
            }
        } catch (e) {
            setError("网络连接失败，将使用默认配置继续");
            setDone(true);
            setSummary("使用默认配置");
            setTimeout(() => onDone(), 2000);
        } finally {
            setBusy(false);
        }
    };

    // 初始化：检查是否有进行中的设置
    useEffect(() => {
        const init = async () => {
            const status = await callSetupStatus();
            if (status.done) {
                setDone(true);
                setSummary("配置已完成");
                setTimeout(() => onDone(), 1000);
                return;
            }
            if (status.history && status.history.length > 0) {
                setHistory(status.history);
                // 获取下一个问题
                const lastAnswer = status.history[status.history.length - 1]?.content;
                if (lastAnswer !== undefined) {
                    fetchNext(lastAnswer);
                } else {
                    fetchNext("");
                }
            } else {
                fetchNext("");
            }
        };
        init();
    }, []);

    // 自动滚动到最新消息
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [history, question]);

    const handleSelect = (option) => {
        const newHistory = [...history, { role: "user", content: option }];
        setHistory(newHistory);
        setInputVal("");
        fetchNext(option);
    };

    const handleSubmit = () => {
        if (!inputVal.trim() || busy) return;
        const val = inputVal.trim();
        setInputVal("");
        const newHistory = [...history, { role: "user", content: val }];
        setHistory(newHistory);
        fetchNext(val);
    };

    if (done) {
        return (
            <div className="login-card">
                <h1 className="login-title">配置完成</h1>
                <p className="login-sub"><TypeMsg text={summary} /></p>
                <div className="prompt-btns">
                    <button className="login-btn primary" onClick={onDone}>进入系统</button>
                    <button className="login-btn ghost" onClick={onSkip}>跳过</button>
                </div>
            </div>
        );
    }

    return (
        <div className="login-card setup-wizard">
            <h1 className="login-title">什亭之匣 · 初始化</h1>

            {/* 对话历史 */}
            <div className="setup-chat" ref={chatRef}>
                {history.map((h, i) => (
                    <div key={i} className={`chat-msg ${h.role}`}>
                        <div className="chat-bubble">{h.content}</div>
                    </div>
                ))}
                {question && (
                    <div className="chat-msg assistant">
                        <div className="chat-bubble">
                            <TypeMsg
                                text={question.question}
                                speed={50}
                            />
                        </div>
                    </div>
                )}
                {error && <div className="chat-error">{error}</div>}
            </div>

            {/* 选项按钮（select 类型） */}
            {question?.type === "select" && question.options && (
                <div className="setup-options">
                    {question.options.map((opt, i) => (
                        <button key={i} className="setup-opt-btn" onClick={() => handleSelect(opt)}>
                            {opt}
                        </button>
                    ))}
                </div>
            )}

            {/* 输入框（text/password 类型） */}
            {question?.type !== "select" && question && (
                <div className="setup-input-row">
                    <input
                        ref={inputRef}
                        type={question.type === "password" ? "password" : "text"}
                        placeholder="输入回答…"
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        disabled={busy}
                    />
                    <button className="login-round" onClick={handleSubmit} disabled={busy} aria-label="发送">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14" />
                            <path d="M13 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}

            {busy && <div className="setup-busy">思考中…</div>}

            <button className="login-btn ghost setup-skip" onClick={onSkip}>跳过初始化</button>
        </div>
    );
}

// ─── 欢迎消息底部面板 ──────────────────────────────────
function WelcomeScreen({ onDone }) {
    const [displayed, setDisplayed] = useState("");
    const [show, setShow] = useState(false);
    const [started, setStarted] = useState(false);
    const [finished, setFinished] = useState(false);
    const [allDone, setAllDone] = useState(false);
    const [step, setStep] = useState(0); // 0=欢迎语, 1=转接语
    // 占位符在"老师"前面，username默认为空
    const username = ""; // 后续从配置读取
    const initialized = (function() {
        try {
            return !!localStorage.getItem("aios_setup_done");
        } catch(e) { return false; }
    })();
    const texts = [
        "欢迎连接【什亭之匣】，${username}老师。",
        "为进行生物识别及生成认证书，现将为您转接至主操作系统A.R.O.N.A。"
    ];
    const currentText = texts[step].replace(/\$\{username\}/g, username);

    useEffect(() => {
        // 等待 0.5s 后显示文本框
        const showTimer = setTimeout(() => {
            setShow(true);
            // 再等待 0.5s 后开始逐字输出
            setTimeout(() => setStarted(true), 500);
        }, 500);
        return () => clearTimeout(showTimer);
    }, []);

    // 逐字输出（支持中文标点延迟）
    useEffect(() => {
        if (!started) return;
        let i = 0;
        function tick() {
            if (i >= currentText.length) {
                setFinished(true);
                return;
            }
            i++;
            setDisplayed(currentText.slice(0, i));
            const ch = currentText[i - 1];
            const delay = CN_PUNCT.has(ch) ? CN_PUNCT_DELAY : 60;
            setTimeout(tick, delay);
        }
        setTimeout(tick, 60);
        return () => {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started, step]);

    // 输出完毕后等待 Enter / Space 键跳转
    useEffect(() => {
        if (!finished) return;
        const handler = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (step === 0 && !initialized) {
                    // 进入下一段
                    setFinished(false);
                    setDisplayed("");
                    setStarted(false);
                    setStep(1);
                    // 延迟后开始下一段输出
                    setTimeout(() => setStarted(true), 500);
                } else {
                    setAllDone(true);
                    onDone();
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [finished, step, initialized, onDone]);

    // 点击：打字中→立即完成；完成后→下一段/跳转
    const handlePanelClick = () => {
        if (!started) return;
        if (!finished) {
            setDisplayed(currentText);
            setFinished(true);
        } else if (!allDone) {
            if (step === 0 && !initialized) {
                setFinished(false);
                setDisplayed("");
                setStarted(false);
                setStep(1);
                setTimeout(() => setStarted(true), 500);
            } else {
                setAllDone(true);
                onDone();
            }
        }
    };

    return (
        <div className={"bottom-panel" + (show ? "" : " hidden")} onClick={handlePanelClick} style={{ pointerEvents: "auto" }}>
            <div className="bp-bg"></div>
            <div className="bp-line"></div>
            <div className="bp-content">
                <div className="bp-body">{displayed}</div>
            </div>
        </div>
    );
}

// ─── 应用根组件 ─────────────────────────────────────────
function LoginApp() {
    const [mode, setMode] = useState("login");   // "login" | "welcome"
    const [leaving, setLeaving] = useState(false);

    const exit = () => {
        // 白色渐入转场
        const t = document.getElementById("page-transition");
        if (t) {
            t.style.opacity = "1";
            t.style.pointerEvents = "auto";
        }
        setLeaving(true);
        setTimeout(() => {
            window.location.href = "index.html";
        }, 400);
    };

    return (
        <div className={`login-overlay ${leaving ? "leaving" : ""}`}>
            <div className="login-bg" aria-hidden="true"></div>
            {mode === "welcome"
                ? <WelcomeScreen onDone={exit} />
            : <LoginScreen onLogin={() => {
                setMode("welcome");
            }} />}
        </div>
    );
}

// 挂载
function mountLogin() {
    const root = document.createElement("div");
    root.id = "login-root";
    document.body.appendChild(root);
    ReactDOM.createRoot(root).render(<LoginApp />);
}
if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", mountLogin);
} else {
    mountLogin();
}
