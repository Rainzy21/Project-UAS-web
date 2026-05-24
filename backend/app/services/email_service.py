"""B13 — Email service using aiosmtplib.

Provides:
  send_verification_email(to, token)
  send_password_reset_email(to, token)
"""
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def _build_message(to: str, subject: str, plain: str, html: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))
    return msg


async def _send(message: MIMEMultipart) -> None:
    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_verification_email(to: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    subject = "Verify your email address"
    plain = f"Click the link to verify your email:\n\n{verify_url}\n\nThis link expires in 24 hours."
    html = f"""<html><body>
<p>Click the link below to verify your email address:</p>
<p><a href="{verify_url}">{verify_url}</a></p>
<p>This link expires in 24 hours.</p>
</body></html>"""
    await _send(_build_message(to, subject, plain, html))


async def send_password_reset_email(to: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    subject = "Reset your password"
    plain = f"Click the link to reset your password:\n\n{reset_url}\n\nThis link expires in 1 hour."
    html = f"""<html><body>
<p>Click the link below to reset your password:</p>
<p><a href="{reset_url}">{reset_url}</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>
</body></html>"""
    await _send(_build_message(to, subject, plain, html))
