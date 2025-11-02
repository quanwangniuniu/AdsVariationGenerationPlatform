"use client";

import { useState, useEffect } from "react";
import axios from "@/lib/axiosConfig";
import Navbar from "@/components/navbar/Navbar";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  appendAuthHeaders,
  getStoredAuthToken,
  redirectToAuthWithNext,
} from "@/lib/authHelpers";

export default function AIChatPage() {
  const [originalAdId, setOriginalAdId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [variant, setVariant] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const params = useSearchParams();
  const [records, setRecords] = useState<any[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const latestRecords = Array.isArray(records) ? records.slice(0, 9) : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const resolveAuthToken = () => getStoredAuthToken();
  const requireToken = () => {
    const token = resolveAuthToken();
    if (!token) {
      redirectToAuthWithNext();
      return null;
    }
    return token;
  };

  const fetchRecords = async () => {
    try {
      const token = requireToken();
      if (!token) return;

      const res = await axios.get("/api/adspark/creatives/", {
        headers: appendAuthHeaders({ Authorization: `Token ${token}` }),
      });

      const creatives = res.data.results || res.data;

      setRecords(creatives);
    } catch (error) {
      console.error("Failed to fetch records:", error);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    const adId = searchParams.get("ad_id");
    if (adId) {
      setOriginalAdId(adId);
    }
  }, [searchParams]);

  useEffect(() => {
    const promptFromTemplate = params.get("template");
    if (promptFromTemplate) {
      setPrompt(promptFromTemplate);
    }
  }, [searchParams]);

  // refresh image
  useEffect(() => {
    if (response?.variant?.id) {
      const variantId = response.variant.id;
      const interval = setInterval(async () => {
        try {
          const token = requireToken();
          if (!token) {
            clearInterval(interval);
            return;
          }
          const res = await axios.get(
            `/api/advariants/ad-variants/${variantId}/`,
            {
              headers: appendAuthHeaders({ Authorization: `Token ${token}` }),
            }
          );
          const data = res.data;
          setVariant(data);
        } catch (error) {
          console.error("useEffect Error:", error);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [response]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // prevent refresh
    setLoading(true);
    setShowTips(false);

    try {
      const token = requireToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Get CSRF token from cookie
      const res = await axios.post(
        "/api/advariants/ad-variants/",
        {
          original_ad_id: originalAdId,
          prompt: prompt,
          ai_agent_platform: "dify",
        },
        {
          headers: appendAuthHeaders(
            {
              "Content-Type": "application/json",
              Authorization: `Token ${token}`,
            },
            { includeCsrf: true }
          ),
        }
      );

      setResponse(res.data);
      setVariant(res.data.variant);
    } catch (error: any) {
      console.error("Request failed:", error);
      alert(error.response?.data?.error || "Failed to send request.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnother = () => {
    setOriginalAdId("");
    setPrompt("");
    setResponse(null);
    setVariant(null);
    setShowTips(true);
  };

  const handleStartEditing = (record: any, event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingId(record.ad_creative_id);
    // Priority: user_custom_title > creative_title
    setEditingValue(record.user_custom_title || record.creative_title || "");
  };

  const handleCancelEditing = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingId(null);
    setEditingValue("");
    setSavingId(null);
  };

  const handleSaveTitle = async (recordId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const trimmed = editingValue.trim();
    try {
      setSavingId(recordId);
      const token = requireToken();
      if (!token) {
        setSavingId(null);
        return;
      }

      // Save to user-specific title endpoint
      await axios.post(
        `/api/adspark/creatives/${recordId}/user_title/`,
        { custom_title: trimmed.length > 0 ? trimmed : null },
        {
          headers: appendAuthHeaders(
            {
              "Content-Type": "application/json",
              Authorization: `Token ${token}`,
            },
            { includeCsrf: true }
          ),
        }
      );

      // Update local state with user_custom_title
      setRecords((prev) =>
        prev.map((item) =>
          item.ad_creative_id === recordId
            ? { ...item, user_custom_title: trimmed.length > 0 ? trimmed : null }
            : item
        )
      );
      setEditingId(null);
      setEditingValue("");
    } catch (error) {
      console.error("Failed to update title:", error);
      alert("Failed to update title. Please try again.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <Navbar />

      {/* Edit Modal */}
      {editingId && (
        <div className="modal-overlay" onClick={handleCancelEditing}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Edit Title</h3>
            <p className="modal-subtitle">Customize the title for your creative</p>
            <input
              className="modal-input"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveTitle(editingId);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  handleCancelEditing();
                }
              }}
              placeholder="Enter a custom title..."
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button"
                onClick={handleCancelEditing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button primary"
                onClick={() => handleSaveTitle(editingId)}
                disabled={savingId === editingId}
              >
                {savingId === editingId ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex h-screen">
        {/* left side */}
        <aside className="w-1/5 bg-gray-50 border-r p-4">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">
            Generated Ads
          </h2>
          <h3 className="text-lg font-bold mb-4">Your Records</h3>


          <p className=" bg-gray-50 ">Explore every variant generated by your in library.</p>


          <div className="mt-6">
            <button
              onClick={() => router.push("/library")}
              className="history-btn"
            >
              Library
            </button>
          </div>

          <h3 className="text-lg font-bold mb-4">Assets List</h3>
        
          <ul className="space-y-3 max-h-[70vh] overflow-y-auto">
            {records.length === 0 ? (
              <p className="text-gray-400 text-sm">No records yet.</p>
            ) : (
              (latestRecords ?? records).slice(0, 5).map((item) => (
                <li
                  key={item.ad_creative_id}
                  className="record-item"
                  onClick={() => setOriginalAdId(item.ad_creative_id)}
                >
                  <button
                    type="button"
                    className="record-edit-button"
                    onClick={(event) => handleStartEditing(item, event)}
                    aria-label="Edit creative title"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-square-pen-icon"
                    >
                      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
                    </svg>
                  </button>

                  <div className="record-title-container">
                    <span
                      className="record-title"
                      title={item.user_custom_title || item.creative_title || "Untitled"}
                    >
                      {item.user_custom_title || item.creative_title || "Untitled"}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>

<p style={{ fontSize: '12px', color: '#9CA3AF' }}>
  Latest 5 materials in the database
</p>


          <div className="mt-6">
            <button
              onClick={() => router.push("/history")}
              className="history-btn"
            >
              More History
            </button>
          </div>

        </aside>

        {/* right side */}
        <section className="w-4/5 flex flex-col justify-between p-10">
          {/* Tips */}
          {showTips && (
            <div className="flex justify-center items-center w-full">
              <div className="tips-card">
                <h4 className="font-semibold mb-2">Tips</h4>
                <p className="text-gray-600 text-sm">
                  Send the diagram id from the library and prompt to obtain the
                  desired new ad post.
                </p>
              </div>
            </div>
          )}

          {/* Tips disappear */}
          {!showTips && variant && (
            <div className="display-card" style={{ width: "800px", boxSizing: "border-box" }}>
              <div className="variant-wrap">
                <div className="variant-row">
                  <div className="variant-image">
                    {variant.variant_image_url ? (
                      <img
                        src={variant.variant_image_url}
                        alt="Generated Ad"
                        className="variant-image-el"
                      />
                    ) : (
                      <p className="variant-hint">⏳ Generating image...</p>
                    )}
                  </div>

                  <div className="variant-details">
                    {/* <select className="select">
                    <option>Key words</option>
                  </select> */}
                    <button className="like-btn">Advertising Caption ♥</button>
                    <div className="variant-card">
                      <h3 className="variant-title">{variant.variant_title}</h3>
                      <p className="variant-desc">
                        {variant.variant_description || "No description yet."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* form area */}
          <div className="w-[90%] mx-auto bg-[#FFF8E7] border rounded-md shadow-sm p-8">
            <div className="form-card">
              <form onSubmit={handleSubmit}>
                <div className="form-left">
                  <div>
                    <label>Diagram id</label>
                    <input
                      type="text"
                      value={originalAdId}
                      onChange={(e) => setOriginalAdId(e.target.value)}
                      placeholder="12344556sfwe"
                      required
                    />
                  </div>

                  <div>
                    <label>Prompt</label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Description"
                      rows={3}
                      required
                    />
                  </div>
                </div>

                <div className="form-right">
                  <button type="submit" disabled={loading}>
                    {loading
                      ? "Sending..."
                      : showTips
                        ? "Send"
                        : "Create another"}
                  </button>
                </div>
              </form>




              {/* API response display */}
              {response && (
                <div className="mt-6 bg-white p-4 rounded border shadow">
                  <h4 className="font-semibold text-gray-800 mb-2">
                    API Response
                  </h4>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        main {
          min-height: 100vh;
          background: linear-gradient(
            135deg,
            #fdf2f8 0%,
            #fef7ed 50%,
            #f3e8ff 100%
          );
          font-family: "Inter", sans-serif;
          display: flex;
        }

        aside {
          width: 18%;
          background: rgba(255, 255, 255, 0.85);
          border-right: 2px solid #fce7f3;
          padding: 32px 20px;
          box-shadow: 4px 0 20px rgba(236, 72, 153, 0.05);
        }

        aside h2 {
          font-size: 18px;
          color: #6b7280;
          font-weight: 600;
        }

        aside h3 {
          font-family: "Playfair Display", serif;
          font-size: 22px;
          font-weight: 600;
          background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 20px;
        }

        aside ul {
          list-style: none;
          padding-left: 0;
          margin: 0;
        }

        aside ul li {
          padding: 10px 14px;
          border-radius: 12px;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 0;
        }

        .record-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-bottom: 1px solid #e5e7eb;
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.2s ease;
          min-width: 0;
          overflow: hidden;
        }

        .record-item:hover {
          background: #fef3c7;
        }

        .record-title-container {
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }

        .record-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #374151;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
          width: 100%;
        }

        .record-edit-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          border-radius: 6px;
          border: none;
          background: rgba(139, 92, 246, 0.12);
          color: #7c3aed;
          transition: background 0.2s ease, transform 0.2s ease;
          cursor: pointer;
        }

        .record-edit-button:hover {
          background: rgba(139, 92, 246, 0.2);
          transform: translateY(-1px);
        }

        aside ul li:hover {
          background: #fdf2f8;
        }

  .history-btn {
  background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 12px 36px;
    font-weight: 600;
    transition: all 0.3s ease;
    height: fit-content;
     margin-top: 20px;        
  display: block;  
    }
.history-btn:hover {
  background: #1f2937;
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(0,0,0,.12);
}

        section {
          flex: 1;
          padding: 40px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
        }
        .tips-card {
          width: 95%;
          max-width: 700px;
          background: rgba(255, 255, 255, 0.9);
          border: 2px solid #fce7f3;
          border-radius: 16px;
          box-shadow: 0 8px 16px rgba(236, 72, 153, 0.08);
          padding: 24px 32px;
          text-align: left;
        }

        .tips-card h4 {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 4px;
          color: #111827;
        }

        .tips-card p {
          color: #6b7280;
          font-size: 14px;
          line-height: 1.5;
        }
.display-card {
    width: 90%;
    background: rgba(255, 255, 255, 0.85);
    border: 2px solid #fce7f3;
    border-radius: 20px;
    padding-block: 32px;
    align-items: start;
  }

.form-card {
    width: 90%;
    background: rgba(255, 255, 255, 0.85);
    border: 2px solid #fce7f3;
    border-radius: 20px;
    box-shadow: 0 10px 25px rgba(236, 72, 153, 0.08),
      0 5px 15px rgba(139, 69, 19, 0.05);
    padding: 32px 50px;
      align-items: start;
  }

  .form-card form {
    display: grid;
    grid-template-columns: 2fr 1fr; 
    gap: 40px;
    align-items: center;
    align-items: start;
  }

  .form-left {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .form-card label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
  }

  .form-card input,
  .form-card textarea {
    width: 100%;
    border: 2px solid #fce7f3;
    border-radius: 12px;
    padding: 10px 14px;
    background: #fff;
    font-family: "Inter", sans-serif;
    transition: all 0.3s ease;
  }

  .form-card input:focus,
  .form-card textarea:focus {
    outline: none;
    border-color: #f9a8d4;
    box-shadow: 0 0 0 4px rgba(249, 168, 212, 0.1);
  }

  .form-right {
   justify-self: center;  
   align-self: center; 
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .form-card button {
    background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 12px 36px;
    font-weight: 600;
    transition: all 0.3s ease;
    height: fit-content;
  }

  .form-card button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(249, 168, 212, 0.4);
  }

  @media (max-width: 768px) {
    .form-card form {
      grid-template-columns: 1fr;
    }
    .form-right {
      justify-content: center;
    }
    .form-card button {
      width: 100%;
    }
  }
    /*new ad display*/
.variant-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
}

.variant-row {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.variant-image {
  background: #fcf5f8ff;                 
  width: 400px;
  height: 250px;
  border-radius: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 2px solid #fce7f3;           
  box-shadow: 0 8px 16px rgba(236, 72, 153, 0.08),
              0 4px 10px rgba(139, 92, 246, 0.06); 
  overflow: hidden;
}

.variant-image-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.variant-hint {
  color: #6b7280;                     
  font-size: 14px;
}

.variant-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.select {
  border: 2px solid #fce7f3;            
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 14px;
  background: #fff;
}

.like-btn {
  background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
  color: #fff;
  border: 0;
  border-radius: 12px;
  padding: 8px 14px;
  font-weight: 600;
  box-shadow: 0 6px 14px rgba(249, 168, 212, 0.25);
}
.like-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(249, 168, 212, 0.35);
}

.variant-card {
  width: 220px;
  background: #ffffff;
  border: 2px solid #fce7f3;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 8px 16px rgba(236, 72, 153, 0.06);
}

.variant-title {
  font-weight: 600;
  color: #111827;
}

.variant-desc {
  margin-top: 8px;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.5;
}

/* Modal Styles - Warm & Elegant Design */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  border: 2px solid #F3E8FF;
  border-radius: 24px;
  padding: 28px 32px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 15px 35px rgba(255, 138, 171, 0.15),
              0 4px 12px rgba(0, 0, 0, 0.03),
              0 8px 24px rgba(255, 184, 107, 0.12);
  position: relative;
}

.modal-title {
  font-size: 22px;
  font-weight: 700;
  font-family: 'Playfair Display', Georgia, serif;
  color: #2D2A32;
  margin-bottom: 8px;
  text-align: left;
  background: linear-gradient(135deg, #FF8FAB, #FFB86B);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

.modal-subtitle {
  font-size: 13px;
  color: #8B5CF6;
  margin-bottom: 24px;
  text-align: left;
  font-weight: 500;
}

.modal-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid rgba(243, 232, 255, 0.8);
  border-radius: 14px;
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  background: #FFF7F2;
  transition: all 300ms ease;
  margin-bottom: 24px;
  box-sizing: border-box;
  color: #2D2A32;
}

.modal-input::placeholder {
  color: #9CA3AF;
}

.modal-input:focus {
  outline: none;
  border-color: #C084FC;
  background: #FFFFFF;
  box-shadow: 0 0 0 4px rgba(192, 132, 252, 0.15),
              0 4px 12px rgba(192, 132, 252, 0.1);
  transform: translateY(-1px);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.modal-button {
  padding: 10px 24px;
  border-radius: 14px;
  border: 2px solid #E9D5FF;
  background: #FFFFFF;
  color: #8B5CF6;
  font-size: 14px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: all 200ms ease-in-out;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.08);
}

.modal-button:hover {
  background: #F9F5FF;
  border-color: #C084FC;
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(139, 92, 246, 0.15);
}

.modal-button:active {
  transform: translateY(0);
}

.modal-button.primary {
  background: linear-gradient(135deg, #F9A8D4, #FFB86B, #C084FC);
  border-color: transparent;
  color: white;
  box-shadow: 0 6px 18px rgba(249, 168, 212, 0.35);
}

.modal-button.primary:hover {
  background: linear-gradient(135deg, #EC4899, #F59E0B, #8B5CF6);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(249, 168, 212, 0.45);
}

.modal-button.primary:active {
  transform: translateY(0);
  box-shadow: 0 4px 12px rgba(249, 168, 212, 0.35);
}

.modal-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.modal-button:disabled:hover {
  background: linear-gradient(135deg, #F9A8D4, #FFB86B, #C084FC);
  transform: none;
  box-shadow: 0 6px 18px rgba(249, 168, 212, 0.35);
}

/* Responsive Design */
@media (max-width: 640px) {
  .modal-content {
    padding: 24px 20px;
    border-radius: 20px;
    max-width: 100%;
    margin: 0 16px;
  }

  .modal-title {
    font-size: 20px;
  }

  .modal-actions {
    flex-direction: column;
    gap: 10px;
  }

  .modal-button {
    width: 100%;
    padding: 12px 20px;
  }
}

      `}</style>
    </>
  );
}
