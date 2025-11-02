"use client";

import { useState, useEffect } from "react";
import axios from "@/lib/axiosConfig";
import Navbar from "@/components/navbar/Navbar";

export default function HistoryBoardPage() {
  const [activeTab, setActiveTab] = useState("ads");
// generated history
function GeneratedAdsHistory() {
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const token =
          (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
          (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));
        if (!token) {
          setAds([]);
          setLoading(false);
          return;
        }

        const res = await axios.get(
            "/api/adspark/creatives/",
             {
          headers: { Authorization: `Token ${token}` },
        });

        setAds(res.data.results || []);
      } catch (err) {
        console.error("Failed to fetch ads history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAds();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {ads.length === 0 ? (
        <p>No generated ads history yet.</p>
      ) : (
         <div className="space-y-6">
          {ads.map((item) => {
            const created = item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown date';
            return (
              <HistoryCard
                key={item.ad_creative_id || item.id}
                title={item.advertiser_name || 'Generated Ad'}
                description={`Format: ${item.format || 'N/A'} • Region: ${item.region || 'N/A'} • ${created}`}
                image_url={item.image_url}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// upload
function UploadsHistory() {
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const token =
          (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
          (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));
        if (!token) {
          setUploads([]);
          setLoading(false);
          return;
        }
        const res = await axios.get("/api/assets/files/", {//fake
          headers: { Authorization: `Token ${token}` },
        });
        setUploads(res.data.results || []);
      } catch (err) {
        console.error("Failed to fetch uploads:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUploads();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {uploads.length === 0 ? (
        <p>No uploads history yet.</p>
      ) : (
        <div className="space-y-6">
          {uploads.map((item) => (
            <HistoryCard key={item.id} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}


function UserOperations() {
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOperations = async () => {
      try {
        const token =
          (typeof window !== 'undefined' && window.sessionStorage.getItem('authToken')) ||
          (typeof window !== 'undefined' && window.localStorage.getItem('authToken'));
        if (!token) {
          setOperations([]);
          setLoading(false);
          return;
        }
        const res = await axios.get("/api/audit/logs/", {
          headers: { Authorization: `Token ${token}` },
        });
        const results = res.data.results || res.data || [];
        const formatted = results.map((item: any) => {
          const occurred = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Unknown time';
          return {
            id: item.id,
            title: item.request_summary || 'User request',
            description: `${item.location_label || 'Activity'} • Status ${item.status_code} • ${occurred}`,
            link: item.page_url || null,
          };
        });
        setOperations(formatted);
      } catch (err) {
        console.error("Failed to fetch operations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOperations();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {operations.length === 0 ? (
        <p>No user operations yet.</p>
      ) : (
        <div className="space-y-6">
          {operations.map((item) => (
            <HistoryCard key={item.id} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ title, description, image_url, link }: any) {
  return (
    <>
    <div className="history-row">
      <div className="thumb">
        {image_url ? (
          <img src={image_url} alt={title || "thumbnail"} />
        ) : (
          <span className="noimg">—</span>
        )}
      </div>

      <div className="meta">
        <h3 className="title">{title || "Untitled"}</h3>
        <p className="desc">{description || "No description."}</p>
      </div>

      {/* <div className="actions">
        {link ? (
          <a className="row-btn" href={link}>
            View
          </a>
        ) : (
          <span className="row-btn disabled">View</span>
        )}
      </div> */}
    </div>

    <style jsx>{`
      .history-row{ 
        display:grid; 
        grid-template-columns:96px 1fr 100px; 
        align-items:center; 
        gap:16px; 
        padding:12px; 
        background:rgba(255,255,255,.92); 
        border-bottom:1px solid #f7e6f1; 
        transition:background .15s; 
        }
      .history-row:hover{ 
        background:#fdf2f8; 
        }
      .thumb{ 
        width:96px; 
        height:72px; 
        border-radius:10px; 
        background:#fff8e7; 
        border:1px solid #f3c7e2; 
        display:flex; 
        align-items:center; 
        justify-content:center; 
        overflow:hidden;
         }

      .thumb img{ 
        width:100%; 
        height:100%; 
        object-fit:cover; 
        display:block; }
        .noimg{ 
        color:#c4c4c4; 
        font-size:12px; }
      .meta{ min-width:0; }
      .title{
        margin:0 0 4px 0;
        font-size:14px; 
        font-weight:600; 
        color:#1f2937; 
        white-space:nowrap; 
        overflow:hidden; 
        text-overflow:ellipsis; 
        }
      .desc{ 
        margin:0; 
        font-size:12px; 
        color:#6b7280; 
        line-height:1.4; 
        display:-webkit-box; 
        -webkit-line-clamp:2; 
        -webkit-box-orient:vertical; 
        overflow:hidden; }
        
      .actions{ 
        display:flex; 
        justify-content:flex-end; }
      .row-btn{ 
        appearance:none; 
        border:1px solid #e9d5ff; 
        background:#fff; 
        color:#6d28d9; 
        padding:6px 10px; 
        font-weight:600; 
        font-size:12px; 
        border-radius:10px; 
        cursor:pointer; 
        transition:background .15s, border-color .15s, transform .12s; 
        display:inline-flex; 
        align-items:center; 
        justify-content:center; 
        text-decoration:none; 
        }
        
      .row-btn.disabled{ 
        opacity:.55; 
        cursor:default; 
        pointer-events:none; 
        }

      .row-btn:not(.disabled):hover{ 
        background:#faf5ff; 
        border-color:#d8b4fe; 
        transform:translateY(-1px); 
        }
        
      @media (max-width:800px){ 
        .history-row{ 
        grid-template-columns:72px 1fr; 
        gap:12px; } 
        .thumb{ 
        width:72px; 
        height:54px; } 
        .actions{ 
        grid-column:2/-1; 
        justify-content:flex-start; 
        margin-top:4px; 
        } }
      `}</style>
    </>
  );
}

  return (
    <>
      <Navbar />
      <main className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="w-1/4 bg-white p-6 border-r">
          <h2 className="text-lg font-semibold mb-6">History board</h2>
          <ul className="space-y-4">
            <li
              className={`p-2 rounded cursor-pointer ${
                activeTab === "operations" ? "bg-yellow-100" : ""
              }`}
              onClick={() => setActiveTab("operations")}
            >
              <h3 className="font-medium">User Operations</h3>
              <p className="text-sm text-gray-500">Menu description.</p>
            </li>
            
            <li
              className={`p-2 rounded cursor-pointer ${
                activeTab === "ads" ? "bg-yellow-100" : ""
              }`}
              onClick={() => setActiveTab("ads")}
            >
              <h3 className="font-medium">Generated History</h3>
              <p className="text-sm text-gray-500">Menu description.</p>
            </li>

            <li
              className={`p-2 rounded cursor-pointer ${
                activeTab === "uploads" ? "bg-yellow-100" : ""
              }`}
              onClick={() => setActiveTab("uploads")}
            >
              <h3 className="font-medium">Uploads History</h3>
              <p className="text-sm text-gray-500">Menu description.</p>
            </li>

          </ul>
        </aside>

        {/* Main content area */}
        <section className="flex-1 p-8 overflow-y-auto">
          {activeTab === "ads" && <GeneratedAdsHistory />}
          {activeTab === "uploads" && <UploadsHistory />}
          {activeTab === "operations" && <UserOperations />}
        </section>
      </main>
      <style jsx>{`
  main {
    min-height: 100vh;
    background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
    font-family: 'Inter', sans-serif;
    display: flex;
  }

  aside {
    width: 18%;
    background: rgba(255, 255, 255, 0.9);
    border-right: 2px solid #fce7f3;
    padding: 32px 24px;
    box-shadow: 4px 0 20px rgba(236, 72, 153, 0.05);
  }

  aside h2 {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 600;
    background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 24px;
  }

  aside ul {
  list-style: none;  
  padding-left: 0;   
  margin: 0;
}

  aside ul li {
    padding: 12px 16px;
    border-radius: 16px;
    transition: all 0.3s ease;
  }

  aside ul li:hover {
    background: #fdf2f8;
  }

  aside ul li.bg-yellow-100 {
    background: linear-gradient(135deg, #f9a8d4 0%, #fef7ed 50%, #f3e8ff 100%);
    box-shadow: 0 4px 10px rgba(249, 168, 212, 0.2);
  }

  section {
    flex: 1;
    padding: 48px;
    overflow-y: auto;
  }

  section h3 {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    color: #374151;
  }

  p {
    color: #6b7280;
    font-size: 14px;
  }

  

  @media (max-width: 1024px) {
    aside {
      width: 100%;
      border-right: none;
      border-bottom: 2px solid #fce7f3;
      box-shadow: none;
    }

    main {
      flex-direction: column;
    }

    section {
      padding: 32px 16px;
    }
  }
    
`}</style>

    </>
  );
}
