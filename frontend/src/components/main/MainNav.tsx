"use client";

import Link from "next/link";
import { UserCircleIcon } from "@heroicons/react/24/outline";

export default function MainNav() {
  return (
    <div className="main-container">
      <nav className="main-nav">
        <div className="nav-left">
          <h2 className="logo">Elegance</h2>
          <Link href="/" className="nav-link ">Home</Link>
          <Link href="/campaigns" className="nav-link">Campaigns</Link>
          <Link href="/testpage" className="nav-link">Test</Link>
        </div>
       
        <div className="nav-right">
          <div className="avatar-placeholder">🙂</div>
        </div>
      </nav>



      <style jsx>{`
        .main-container {
          width: 100%;
          padding: 20px;
          background: linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
          border-radius: 20px;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
        }
        .main-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background:  linear-gradient(135deg, #fdf2f8 0%, #fef7ed 50%, #f3e8ff 100%);
          backdrop-filter: blur(12px);
          padding: 12px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(249, 168, 212, 0.2);
        }
        .nav-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .logo {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          font-weight: 600;
          background: linear-gradient(135deg, #ec4899, #f59e0b, #8b5cf6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-right: 24px;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 500;
          color: #8b5cf6;
          text-decoration: !important;
          transition: color 0.3s ease;
        }
        .nav-link:hover {
          color: #ec4899;
          text-decoration: !important;
        }
        .nav-right {
          display: flex;
          align-items: center;
        }
        .avatar-icon {
          width: 28px;
          height: 28px;
          color: #ec4899;
          cursor: pointer;
          transition: color 0.3s ease;
        }
        .avatar-icon:hover {
          color: #8b5cf6;
        }
        .search-container {
          margin-top: 20px;
          display: flex;
          justify-content: center;
        }
        .search-input {
          width: 100%;
          max-width: 500px;
          padding: 14px 18px;
          border: 2px solid #fce7f3;
          border-radius: 16px;
          font-size: 15px;
          background: #fff;
          transition: all 0.3s ease;
          font-family: 'Inter', sans-serif;
        }
        .search-input:focus {
          outline: none;
          border-color: #f9a8d4;
          background: #fdf2f8;
          box-shadow: 0 0 0 4px rgba(249, 168, 212, 0.1);
        }
      `}</style>
    </div>
  );
}


