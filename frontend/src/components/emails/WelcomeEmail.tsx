// components/emails/WelcomeEmail.tsx
import React from "react";

type User = {
  username: string;
  email: string;
  firstName?: string | null;
  createdAt?: string | null; // ISO string
};

export default function WelcomeEmail({
  siteName,
  siteUrl,
  user,
}: {
  siteName: string;
  siteUrl: string;
  user: User;
}) {
  const displayName = user.firstName && user.firstName.trim() ? user.firstName : user.username;
  const regDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" })
    : "";

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome Email</title>
        <style>
          {`
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
          .container { background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 32px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
          .welcome-title { color: #28a745; font-size: 24px; margin-bottom: 20px; }
          .content { margin-bottom: 30px; }
          .user-info { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .button:hover { background-color: #0056b3; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
          .social-links { margin: 20px 0; }
          .social-links a { display: inline-block; margin: 0 10px; color: #007bff; text-decoration: none; }
        `}
        </style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <div className="logo">{siteName}</div>
            <h1 className="welcome-title">Welcome to Our Platform!</h1>
          </div>

          <div className="content">
            <p>
              Hello <strong>{displayName}</strong>,
            </p>

            <p>
              Thank you for joining {siteName}! We are excited to have you as part of our community.
            </p>

            <div className="user-info">
              <strong>Your Account Details:</strong>
              <br />
              <strong>Username:</strong> {user.username}
              <br />
              <strong>Email:</strong> {user.email}
              <br />
              {regDate && (
                <>
                  <strong>Registration Date:</strong> {regDate}
                </>
              )}
            </div>

            <p>Here are some things you can do to get started:</p>
            <ul>
              <li>Complete your profile information</li>
              <li>Explore our features and services</li>
              <li>Connect with other users</li>
              <li>Check out our help center for tips and tricks</li>
            </ul>

            <div style={{ textAlign: "center" }}>
              <a href={siteUrl} className="button" target="_blank" rel="noopener noreferrer">
                Get Started
              </a>
            </div>

            <p>
              If you have any questions or need assistance, please do not hesitate to contact our support team. We are here to help!
            </p>

            <p>Welcome aboard!</p>
            <p>The {siteName} Team</p>
          </div>

          <div className="footer">
            <div className="social-links">
              <a href="#" target="_blank" rel="noopener noreferrer">Facebook</a>
              <a href="#" target="_blank" rel="noopener noreferrer">Twitter</a>
              <a href="#" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a href="#" target="_blank" rel="noopener noreferrer">Instagram</a>
            </div>

            <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
            <p>
              <a href={`${siteUrl}/privacy`} target="_blank" rel="noopener noreferrer">Privacy Policy</a> |{" "}
              <a href={`${siteUrl}/terms`} target="_blank" rel="noopener noreferrer">Terms of Service</a> |{" "}
              <a href={`${siteUrl}/unsubscribe`} target="_blank" rel="noopener noreferrer">Unsubscribe</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}