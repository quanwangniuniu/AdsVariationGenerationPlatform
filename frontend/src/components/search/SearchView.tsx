"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar/Navbar";
import { appendAuthHeaders, redirectToAuthWithNext, verifySession } from "@/lib/authHelpers";

export type SearchViewProps = {
  workspaceId?: string;
};

function buildAiChatPath(adId: string, workspaceId?: string) {
  const encoded = encodeURIComponent(adId);
  if (workspaceId) {
    return `/workspaces/${workspaceId}/ai_chat?ad_id=${encoded}`;
  }
  return `/ai_chat?ad_id=${encoded}`;
}

export default function AdSearchView({ workspaceId }: SearchViewProps) {
  const [query, setQuery] = useState("");  //keywords
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    workspaceId ? "Results will appear after your workspace search completes." : ""
  );
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const workspaceLabel = workspaceName?.trim()
    ? workspaceName
    : workspaceId ?? "";
  const pageTitle = workspaceId
    ? `Search Workspace${workspaceLabel ? ` · ${workspaceLabel}` : ""}`
    : "Ad Search";
  const pageSubtitle = workspaceId
    ? `Look up creatives that belong to ${workspaceLabel || "this workspace"}. We'll run a scoped watch and surface the results here.`
    : "Trigger a SerpAPI watch to pull the latest ads and review the creatives that come back.";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const authed = await verifySession();
        if (mounted) {
          setIsAuthed(authed);
        }
      } catch {
        if (mounted) {
          setIsAuthed(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Failed to load workspace ${workspaceId}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setWorkspaceName(data?.name || workspaceId);
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceName(workspaceId);
        }
        console.error("Failed to fetch workspace info:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);


  const FIXED_ADVERTISER_ID = "AR17828074650563772417"; // only for tesla

  const handleSearch = async (e: React.FormEvent) => {
    setLoading(true);
    setMessage("Triggering SerpAPI fetch via Watch...");

    try {
      if (!isAuthed) {
        setMessage('Please sign in before searching. Redirecting…');
        redirectToAuthWithNext(800);
        return;
      }

      const createRes = await fetch('/api/adspark/watches/', {
        method: 'POST',
        credentials: 'include',
        headers: appendAuthHeaders({ 'Content-Type': 'application/json' }, { includeCsrf: true }),
        body: JSON.stringify({
          name: query || 'tesla',
          advertiser_ids: FIXED_ADVERTISER_ID,
          is_active: true,
        }),
      });
      if (!createRes.ok) {
        if (createRes.status === 401 || createRes.status === 403) {
          redirectToAuthWithNext(800);
          return;
        }
        setMessage('Failed to create watch.');
        return;
      }
      const createData = await createRes.json();
      const watchId = createData.id;
      console.log('Created Watch:', watchId);

      const triggerRes = await fetch(`/api/adspark/watches/${watchId}/trigger/`, {
        method: 'POST',
        credentials: 'include',
        headers: appendAuthHeaders({ 'Content-Type': 'application/json' }, { includeCsrf: true }),
      });
      if (!triggerRes.ok) {
        if (triggerRes.status === 401 || triggerRes.status === 403) {
          redirectToAuthWithNext(800);
          return;
        }
        setMessage('Failed to trigger fetch.');
        return;
      }
      console.log('Triggered:', await triggerRes.json().catch(() => ({ status: 'ok' })));
      setMessage('Triggered SerpAPI fetch, waiting for results...');

      await new Promise((resolve) => setTimeout(resolve, 5000));

      const creativeRes = await fetch(`/api/adspark/creatives/?search=${encodeURIComponent(query)}`, {
        credentials: 'include',
        headers: appendAuthHeaders(),
      });
      if (!creativeRes.ok) {
        if (creativeRes.status === 401 || creativeRes.status === 403) {
          redirectToAuthWithNext(800);
          return;
        }
        setMessage('Failed to load creatives.');
        return;
      }

      const creativeData = await creativeRes.json();
      console.log('Creative Results:', creativeData);
      setResults(creativeData.results || []);
      setMessage('Fetch complete! Ads loaded from database.');
    } catch (error: any) {
      console.error(" Error:", error);
      setMessage(" Failed to fetch ads. See console for details.");
    } finally {
      setLoading(false);
    }
  };




  return (
    <>
      <Navbar workspaceId={workspaceId} workspaceName={workspaceName} />
      <main className="p-8">
        <h1 className="text-2xl font-semibold mb-2">{pageTitle}</h1>
        <p className="text-gray-600 mb-4">{pageSubtitle}</p>

        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter keyword..."
            className="border border-gray-300  p-2 rounded-full w-[420px] sm:w-[520px] md:w-[620px] transition-all duration-300"
          />

          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-yellow-500 text-white px-6 py-2 rounded-full hover:bg-yellow-600 transition-colors duration-300"
          >
            {loading ? "Loading..." : "Search"}
          </button>

        </div>

        <p className="text-gray-600 mb-6">{message}</p>

        {results.length === 0 ? (
          <p>No results yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-x-10 gap-y-10 p-6">
            {results.map((item) => (
              <div
                key={item.ad_creative_id}
                className="relative bg-white border rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-300 overflow-hidden w-full h-[360px] group"
              >
                {/* image */}
                <div className="card-image-wrapper">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.advertiser_name || "Ad Image"}
                      className="w-full h-56 object-cover"
                    />
                  ) : (
                    <div className="w-full h-56 bg-gray-200 flex items-center justify-center text-gray-500 text-sm">
                      No Image
                    </div>
                  )}
                </div>

                {/* information */}
                <div className="card-info">
                  <h3>{item.advertiser_name}</h3>
                  <p>
                    Diagram id: <span>{item.ad_creative_id}</span>
                  </p>
                </div>

                {/* float */}
                <div className="absolute inset-0">
                  <div>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt="Preview"
                        className="w-40 h-28 object-cover rounded-md shadow mb-4"
                      />
                    ) : (
                      <div className="w-40 h-28 bg-gray-200 rounded-md mb-4 flex items-center justify-center text-gray-500 text-sm">
                        No Image
                      </div>
                    )}
                    <p>Ad ID: {item.ad_creative_id}</p>
                    <button
                      onClick={() => {
                        router.push(buildAiChatPath(item.ad_creative_id, workspaceId));
                      }}
                    >
                      Create Ads
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        )}

      </main>
      <style jsx>{`
              main {
                min-height: 100vh;
                background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
                padding: 48px 24px;
                font-family: 'Inter', sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
              }

              h1 {
                font-family: 'Playfair Display', serif;
                font-size: 32px;
                font-weight: 600;
                background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 16px;
              }

              p {
                color: #6b7280;
                font-size: 15px;
                max-width: 720px;
                text-align: center;
                margin-bottom: 16px;
              }

              input {
                border: 2px solid #fce7f3;
                border-radius: 16px;
                padding: 14px 20px;
                width: 420px;
                background: #fefefe;
                transition: all 0.3s ease;
                font-family: 'Inter', sans-serif;
              }
              input:focus {
                outline: none;
                border-color: #f9a8d4;
                background: #fdf2f8;
                box-shadow: 0 0 0 4px rgba(249, 168, 212, 0.1);
              }

              button {
                border: none;
                border-radius: 16px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                font-family: 'Inter', sans-serif;
              }

              button.bg-yellow-500 {
                background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
                color: #fff;
                padding: 14px 24px;
                margin-left: 8px;
              }
              button.bg-yellow-500:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(249, 168, 212, 0.4);
              }
              button.bg-yellow-500:disabled {
                opacity: 0.7;
                cursor: not-allowed;
              }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    padding: 32px;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
  }

  .relative.bg-white {
    background: rgba(255, 255, 255, 0.9);
    border: 2px solid #fce7f3;
    border-radius: 24px;
    box-shadow: 0 8px 20px rgba(236, 72, 153, 0.1),
                0 4px 10px rgba(139, 69, 19, 0.05);
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    position: relative;
  }
  .relative.bg-white:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 28px rgba(249, 168, 212, 0.3);
  }

  .p-4 h3 {
    font-family: 'Playfair Display', serif;
    color: #374151;
    font-size: 18px;
  }

.absolute.inset-0 {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: scale(0.98);
  transition: opacity 0.35s ease, visibility 0.35s ease, transform 0.35s ease;
}

.relative.bg-white {
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid #fce7f3;
  border-radius: 24px;
  box-shadow: 0 8px 20px rgba(236, 72, 153, 0.1),
              0 4px 10px rgba(139, 69, 19, 0.05);
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  height: 380px;             
  display: flex;
  flex-direction: column;
}
.card-image-wrapper {
  width: 100%;
  height: 220px;             
  overflow: hidden;
  background: #f3f4f6;       
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;          
  display: block;
}

.no-image {
  width: 100%;
  height: 100%;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-info {
  flex-grow: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
}

.card-info h3 {
  font-family: 'Playfair Display', serif;
  color: #374151;
  font-size: 18px;
  margin-bottom: 4px;
}

.card-info p {
  font-size: 14px;
  color: #6b7280;
  text-align: left;
}

.absolute.inset-0 {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: scale(0.98);
  transition: opacity 0.35s ease, visibility 0.35s ease, transform 0.35s ease;
}

.relative.bg-white:hover .absolute.inset-0 {
  opacity: 1;
  pointer-events: all;
  visibility: visible;
  transform: scale(1);
}

.absolute.inset-0 {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(10px);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

.relative.bg-white:hover .absolute.inset-0 {
  opacity: 1;
  visibility: visible;
  pointer-events: all;
}

.absolute.inset-0 > div {
  background: white;
  padding: 20px 28px;
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.15);
  text-align: center;
  transition: transform 0.3s ease;
  transform: translateY(8px);
}

.relative.bg-white:hover .absolute.inset-0 > div {
  transform: translateY(0);
}

.absolute.inset-0 img {
  width: 240px;
  height: 140px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 12px;
}

.absolute.inset-0 button {
  background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
  color: white;
  border: none;
  border-radius: 20px;
  padding: 8px 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.absolute.inset-0 button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(249,168,212,0.4);
}


  @media (max-width: 1024px) {
    .grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

`}</style>

    </>
  );
}
