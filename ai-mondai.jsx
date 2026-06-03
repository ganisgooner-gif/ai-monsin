import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `あなたは整骨院・整体院の臨床問診アシスタントです。柔道整復師の視点から、患者の症状を段階的に評価する専門家です。

【役割】
施術者が患者に「次に何を聞くべきか」を提案します。

【ルール】
- 毎回、次に聞くべき質問を2〜4個提案する
- 質問は短く、患者に直接使える言葉で書く
- 情報が十分集まったら鑑別候補と方針をまとめる
- 常にJSON形式のみで返答する（マークダウン不可、コードブロック不可）

【JSONフォーマット】
{
  "phase": "questioning" または "summary",
  "clinical_reasoning": "現時点での臨床的解釈（施術者向け、1〜2文）",
  "next_questions": [
    {"question": "患者への質問文", "purpose": "なぜこれを聞くか（施術者向け）"}
  ],
  "summary": {
    "differentials": ["鑑別1", "鑑別2", "鑑別3"],
    "most_likely": "最も可能性が高い病態",
    "next_steps": "推奨される評価・施術方針",
    "refer": true,
    "refer_reason": "リファーが必要な場合の理由"
  }
}

phaseが"questioning"のときはsummaryはnull、"summary"のときはnext_questionsは空配列にする。
情報が5〜7回のやり取りで十分集まったらsummaryフェーズに移行する。
必ずJSONのみ返すこと。`;

export default function AIMondai() {
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customAnswer, setCustomAnswer] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const callClaude = async (convHistory) => {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "PLACEHOLDER",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: convHistory,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("API error:", response.status, errText);
        return null;
      }
      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error("callClaude error:", e);
      return null;
    }
  };

  const handleStart = async () => {
    if (!chiefComplaint.trim()) return;
    setStarted(true);
    setLoading(true);
    const userMsg = { role: "user", content: `主訴：${chiefComplaint}` };
    const newConv = [userMsg];
    setConversation(newConv);
    setMessages([{ type: "complaint", text: chiefComplaint }]);
    const result = await callClaude(newConv);
    if (result) {
      const assistantMsg = { role: "assistant", content: JSON.stringify(result) };
      setConversation([...newConv, assistantMsg]);
      setMessages((prev) => [...prev, { type: "ai", data: result }]);
    } else {
      setMessages((prev) => [...prev, { type: "error", text: "APIエラーが発生しました。再度お試しください。" }]);
    }
    setLoading(false);
  };

  const handleAnswer = async (answer) => {
    if (!answer.trim()) return;
    setLoading(true);
    setCustomAnswer("");
    const userMsg = { role: "user", content: answer };
    const newConv = [...conversation, userMsg];
    setConversation(newConv);
    setMessages((prev) => [...prev, { type: "answer", text: answer }]);
    const result = await callClaude(newConv);
    if (result) {
      const assistantMsg = { role: "assistant", content: JSON.stringify(result) };
      setConversation([...newConv, assistantMsg]);
      setMessages((prev) => [...prev, { type: "ai", data: result }]);
    } else {
      setMessages((prev) => [...prev, { type: "error", text: "APIエラーが発生しました。再度お試しください。" }]);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setStarted(false);
    setChiefComplaint("");
    setMessages([]);
    setConversation([]);
    setCustomAnswer("");
  };

  const lastAI = messages.filter((m) => m.type === "ai").slice(-1)[0];
  const isSummary = lastAI?.data?.phase === "summary";

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <div style={styles.logoMark}>問</div>
            <div>
              <div style={styles.logoTitle}>AI問診アシスタント</div>
              <div style={styles.logoSub}>かみふくろう整骨院・整体院</div>
            </div>
          </div>
          {started && (
            <button onClick={handleReset} style={styles.resetBtn}>新規問診</button>
          )}
        </div>
      </div>

      <div style={styles.main}>
        {!started ? (
          <div style={styles.startCard}>
            <div style={styles.startTitle}>主訴を入力してください</div>
            <div style={styles.startSub}>患者さんの一番の訴えを入力すると、次に確認すべき質問を提案します</div>
            <textarea
              style={styles.textarea}
              placeholder="例：2週間前から右膝が痛い、歩くと痛む"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              rows={3}
            />
            <button
              style={{ ...styles.startBtn, opacity: chiefComplaint.trim() ? 1 : 0.4 }}
              onClick={handleStart}
              disabled={!chiefComplaint.trim()}
            >
              問診を開始する →
            </button>
          </div>
        ) : (
          <div style={styles.chatArea}>
            {messages.map((msg, i) => {
              if (msg.type === "complaint") {
                return (
                  <div key={i} style={styles.complaintBadge}>
                    <span style={styles.complaintLabel}>主訴</span>
                    <span style={styles.complaintText}>{msg.text}</span>
                  </div>
                );
              }
              if (msg.type === "answer") {
                return (
                  <div key={i} style={styles.answerBubble}>
                    <div style={styles.answerLabel}>回答</div>
                    <div style={styles.answerText}>{msg.text}</div>
                  </div>
                );
              }
              if (msg.type === "error") {
                return (
                  <div key={i} style={styles.errorBox}>{msg.text}</div>
                );
              }
              if (msg.type === "ai" && msg.data) {
                const d = msg.data;
                return (
                  <div key={i} style={styles.aiBlock}>
                    {d.clinical_reasoning && (
                      <div style={styles.reasoningBox}>
                        <div style={styles.reasoningLabel}>🧠 臨床的解釈</div>
                        <div style={styles.reasoningText}>{d.clinical_reasoning}</div>
                      </div>
                    )}
                    {d.phase === "questioning" && d.next_questions?.length > 0 && (
                      <div style={styles.questionsBox}>
                        <div style={styles.questionsLabel}>次に確認すること</div>
                        {d.next_questions.map((q, qi) => (
                          <div key={qi} style={{
                            ...styles.questionItem,
                            borderBottom: qi < d.next_questions.length - 1 ? "1px solid #1e2130" : "none",
                            marginBottom: qi < d.next_questions.length - 1 ? 12 : 0,
                            paddingBottom: qi < d.next_questions.length - 1 ? 12 : 0,
                          }}>
                            <div style={styles.questionText}>「{q.question}」</div>
                            <div style={styles.questionPurpose}>{q.purpose}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {d.phase === "summary" && d.summary && (
                      <div style={styles.summaryBox}>
                        <div style={styles.summaryTitle}>📋 評価まとめ</div>
                        <div style={styles.summarySection}>
                          <div style={styles.summarySectionLabel}>最も可能性が高い病態</div>
                          <div style={styles.summaryMostLikely}>{d.summary.most_likely}</div>
                        </div>
                        <div style={styles.summarySection}>
                          <div style={styles.summarySectionLabel}>鑑別候補</div>
                          <div style={styles.differentials}>
                            {d.summary.differentials?.map((diff, di) => (
                              <span key={di} style={styles.diffBadge}>{diff}</span>
                            ))}
                          </div>
                        </div>
                        <div style={styles.summarySection}>
                          <div style={styles.summarySectionLabel}>推奨される方針</div>
                          <div style={styles.summaryText}>{d.summary.next_steps}</div>
                        </div>
                        {d.summary.refer && (
                          <div style={styles.referAlert}>
                            ⚠️ 整形外科リファー推奨：{d.summary.refer_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}

            {loading && (
              <div style={styles.loadingBox}>
                <div style={styles.loadingDot} />
                <div style={{ ...styles.loadingDot, animationDelay: "0.2s" }} />
                <div style={{ ...styles.loadingDot, animationDelay: "0.4s" }} />
              </div>
            )}

            {!loading && !isSummary && started && (
              <div style={styles.inputArea}>
                <div style={styles.inputLabel}>患者さんの回答を入力</div>
                <textarea
                  style={styles.answerTextarea}
                  placeholder="患者さんの回答を入力..."
                  value={customAnswer}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  rows={2}
                />
                <button
                  style={{ ...styles.submitBtn, opacity: customAnswer.trim() ? 1 : 0.4 }}
                  onClick={() => handleAnswer(customAnswer)}
                  disabled={!customAnswer.trim()}
                >
                  次の質問へ →
                </button>
              </div>
            )}

            {!loading && isSummary && (
              <div style={styles.doneArea}>
                <button onClick={handleReset} style={styles.newBtn}>新規問診を開始する</button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        * { box-sizing: border-box; }
        textarea:focus { border-color: #4f8ef7 !important; outline: none; }
      `}</style>
    </div>
  );
}

const styles = {
  root: { fontFamily: "'Noto Sans JP', sans-serif", minHeight: "100vh", background: "#0f1117", color: "#e8eaf0", display: "flex", flexDirection: "column" },
  header: { background: "#161820", borderBottom: "1px solid #2a2d3a", padding: "0 16px", position: "sticky", top: 0, zIndex: 10 },
  headerInner: { maxWidth: 680, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { width: 36, height: 36, background: "linear-gradient(135deg, #4f8ef7, #7c5ce8)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff" },
  logoTitle: { fontSize: 14, fontWeight: 700, color: "#e8eaf0", lineHeight: 1.2 },
  logoSub: { fontSize: 10, color: "#6b7080", lineHeight: 1.2 },
  resetBtn: { background: "transparent", border: "1px solid #2a2d3a", color: "#8892a4", padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer" },
  main: { flex: 1, maxWidth: 680, width: "100%", margin: "0 auto", padding: "24px 16px" },
  startCard: { background: "#161820", border: "1px solid #2a2d3a", borderRadius: 16, padding: 28, marginTop: 24 },
  startTitle: { fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#e8eaf0" },
  startSub: { fontSize: 13, color: "#6b7080", marginBottom: 20, lineHeight: 1.6 },
  textarea: { width: "100%", background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 10, padding: "12px 14px", color: "#e8eaf0", fontSize: 14, lineHeight: 1.6, resize: "none", fontFamily: "'Noto Sans JP', sans-serif" },
  startBtn: { marginTop: 16, width: "100%", background: "linear-gradient(135deg, #4f8ef7, #7c5ce8)", border: "none", borderRadius: 10, padding: "14px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  chatArea: { display: "flex", flexDirection: "column", gap: 16 },
  complaintBadge: { display: "flex", alignItems: "flex-start", gap: 10, background: "#1a1d28", border: "1px solid #2a2d3a", borderRadius: 10, padding: "12px 16px" },
  complaintLabel: { background: "linear-gradient(135deg, #4f8ef7, #7c5ce8)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 1 },
  complaintText: { fontSize: 14, color: "#c8ccd8", lineHeight: 1.6 },
  answerBubble: { alignSelf: "flex-end", background: "#1e2235", border: "1px solid #2e3349", borderRadius: 12, padding: "10px 16px", maxWidth: "85%" },
  answerLabel: { fontSize: 10, color: "#4f8ef7", fontWeight: 700, marginBottom: 4, letterSpacing: "0.05em" },
  answerText: { fontSize: 14, color: "#c8ccd8", lineHeight: 1.6 },
  errorBox: { background: "#2a1a1a", border: "1px solid #5a2020", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#e07070" },
  aiBlock: { display: "flex", flexDirection: "column", gap: 12 },
  reasoningBox: { background: "#161820", border: "1px solid #2a2d3a", borderLeft: "3px solid #7c5ce8", borderRadius: "0 10px 10px 0", padding: "12px 16px" },
  reasoningLabel: { fontSize: 11, color: "#7c5ce8", fontWeight: 700, marginBottom: 6, letterSpacing: "0.05em" },
  reasoningText: { fontSize: 13, color: "#8892a4", lineHeight: 1.7 },
  questionsBox: { background: "#161820", border: "1px solid #2a2d3a", borderRadius: 12, padding: 16 },
  questionsLabel: { fontSize: 11, color: "#4f8ef7", fontWeight: 700, marginBottom: 12, letterSpacing: "0.08em", textTransform: "uppercase" },
  questionItem: {},
  questionText: { fontSize: 15, color: "#e8eaf0", lineHeight: 1.6, fontWeight: 500, marginBottom: 4 },
  questionPurpose: { fontSize: 12, color: "#5a6070", lineHeight: 1.5 },
  summaryBox: { background: "#161820", border: "1px solid #2a2d3a", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  summaryTitle: { fontSize: 14, fontWeight: 700, color: "#e8eaf0", borderBottom: "1px solid #2a2d3a", paddingBottom: 12 },
  summarySection: { display: "flex", flexDirection: "column", gap: 6 },
  summarySectionLabel: { fontSize: 11, color: "#6b7080", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
  summaryMostLikely: { fontSize: 16, fontWeight: 700, color: "#4f8ef7" },
  differentials: { display: "flex", flexWrap: "wrap", gap: 6 },
  diffBadge: { background: "#1e2235", border: "1px solid #2e3349", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#8892a4" },
  summaryText: { fontSize: 13, color: "#c8ccd8", lineHeight: 1.7 },
  referAlert: { background: "#2a1a1a", border: "1px solid #5a2020", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#e07070", lineHeight: 1.6 },
  loadingBox: { display: "flex", gap: 6, padding: "16px 0", justifyContent: "center" },
  loadingDot: { width: 8, height: 8, borderRadius: "50%", background: "#4f8ef7", animation: "bounce 1.2s infinite" },
  inputArea: { background: "#161820", border: "1px solid #2a2d3a", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  inputLabel: { fontSize: 11, color: "#6b7080", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" },
  answerTextarea: { width: "100%", background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: "10px 12px", color: "#e8eaf0", fontSize: 14, lineHeight: 1.6, resize: "none", fontFamily: "'Noto Sans JP', sans-serif" },
  submitBtn: { background: "linear-gradient(135deg, #4f8ef7, #7c5ce8)", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  doneArea: { display: "flex", justifyContent: "center", padding: "8px 0" },
  newBtn: { background: "transparent", border: "1px solid #4f8ef7", borderRadius: 10, padding: "12px 24px", color: "#4f8ef7", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
