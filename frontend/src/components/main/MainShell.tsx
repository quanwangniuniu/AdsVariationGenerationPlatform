"use client";
import { useState } from "react";
import MainNav from "./MainNav";

export default function MainShell() {
  const [searchText, setSearchText] = useState("");


  const handleTagClick = (tag: string) => {
    const tags = searchText.split(",").map((t) => t.trim()).filter((t) => t);
    if (!tags.includes(tag)) {
      const newTags = [...tags, tag];
      setSearchText(newTags.join(", "));
    }
  };

  return (
    <div className="page">
      <div className="floating-elements">
        <div className="floating-circle" />
        <div className="floating-circle" />
        <div className="floating-circle" />
      </div>

      <div className="main-container">
        <MainNav />

        <div className="container">
       
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search..."
              className="search-input"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          
          <div className="tags">
            {["Calm", "Energetic", "Romantic", "Playful", "Elegant"].map(
              (tag) => (
                <button
                  key={tag}
                  className="tag-btn"
                  onClick={() => handleTagClick(tag)}
                >
                  {tag}
                </button>
              )
            )}
          </div>

          <h1 style={{ textAlign: "center", color: "#ec4899", marginTop: "40px" }}>
            Main Page
          </h1>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
          position: relative;
        }

        .main-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 1000;
        }

        .container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 40px 30px;
          margin-top: 12px;  
          box-shadow: 0 20px 40px rgba(236, 72, 153, 0.1),
                      0 8px 16px rgba(139, 69, 19, 0.05);
          width: 1500px;
          max-width: 95%;
        }

        .search-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 10px;
        }

        .search-input {
          width: 90%;
          padding: 14px 18px;
          border: 2px solid #fce7f3;
          border-radius: 16px;
          font-size: 15px;
          background: #fff;
          transition: all .3s ease;
          font-family: 'Inter', sans-serif;
        }
        .search-input:focus {
          outline: none;
          border-color: #f9a8d4;
          background: #fdf2f8;
          box-shadow: 0 0 0 4px rgba(249,168,212,.1);
        }

      
        .tags {
          display: flex;
          justify-content: flex-start; /* 靠左对齐 */
          gap: 8px;
          margin: 5px 0 20px 5%;
        }

        .tag-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #f9a8d4, #fbbf24, #c084fc);
          color: white;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tag-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(236,72,153,.3);
        }
      `}</style>
    </div>
  );
}
