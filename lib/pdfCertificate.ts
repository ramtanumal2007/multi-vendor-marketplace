export interface CertificateData {
  sellerIdCode: string;
  storeName: string;
  businessName: string;
  contactName: string;
  issueDate: string;
  validSince: string;
  status: string;
}

export function generatePdfCertificate(data: CertificateData) {
  const certNumber = `CERT-${data.sellerIdCode || 'SLR-000000'}-${new Date().getFullYear()}`;
  const verificationHash = Math.random().toString(36).substring(2, 10).toUpperCase();
  const verificationId = `VER-${verificationHash}-X79`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Authorized Seller Certificate - ${data.storeName}</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        body {
          margin: 0;
          padding: 0;
          font-family: 'Helvetica Neue', Arial, sans-serif;
          background: #f8fafc;
          color: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .cert-card {
          width: 280mm;
          height: 195mm;
          background: #ffffff;
          border: 12px solid #1e293b;
          outline: 3px solid #d97706;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          position: relative;
          box-sizing: border-box;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background-image: radial-gradient(#cbd5e1 0.75px, transparent 0.75px);
          background-size: 24px 24px;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 20px;
        }
        .header h1 {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 4px;
          color: #0f172a;
          margin: 0 0 6px 0;
          text-transform: uppercase;
        }
        .header h2 {
          font-size: 18px;
          font-weight: 600;
          color: #d97706;
          margin: 0;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .body-text {
          text-align: center;
          margin: 25px 0;
        }
        .body-text p {
          font-size: 15px;
          color: #64748b;
          margin: 6px 0;
        }
        .store-title {
          font-size: 36px;
          font-weight: 900;
          color: #1e3a8a;
          margin: 15px 0;
          letter-spacing: 1px;
        }
        .details-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          background: #f1f5f9;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          text-align: center;
        }
        .detail-item {
          display: flex;
          flex-direction: column;
        }
        .detail-item span.label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .detail-item span.val {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-top: 2px solid #e2e8f0;
          padding-top: 20px;
        }
        .seal-box {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .gold-seal {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fbbf24, #d97706);
          border: 4px solid #ffffff;
          box-shadow: 0 4px 10px rgba(217, 119, 6, 0.4);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-weight: 800;
          font-size: 9px;
          text-transform: uppercase;
          text-align: center;
          padding: 6px;
          box-sizing: border-box;
        }
        .qr-placeholder {
          width: 70px;
          height: 70px;
          background: #0f172a;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          border-radius: 8px;
          padding: 4px;
          text-align: center;
        }
        .signature-box {
          text-align: center;
        }
        .signature-line {
          width: 180px;
          border-bottom: 2px dashed #94a3b8;
          margin-bottom: 6px;
        }
        .signature-title {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
        }
      </style>
    </head>
    <body>
      <div class="cert-card">
        <div class="header">
          <h1>Official Marketplace Certification</h1>
          <h2>Authorized Seller Certificate</h2>
        </div>

        <div class="body-text">
          <p>This official certificate verifies that</p>
          <div class="store-title">${data.storeName}</div>
          <p>Operated by <strong>${data.businessName || data.contactName}</strong> is a officially verified seller on our E-Commerce Marketplace Platform.</p>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <span class="label">Certificate No.</span>
            <span class="val">${certNumber}</span>
          </div>
          <div class="detail-item">
            <span class="label">Verification ID</span>
            <span class="val">${verificationId}</span>
          </div>
          <div class="detail-item">
            <span class="label">Seller ID</span>
            <span class="val">${data.sellerIdCode}</span>
          </div>
          <div class="detail-item">
            <span class="label">Current Status</span>
            <span class="val" style="color: ${data.status === 'approved' || data.status === 'Active' ? '#16a34a' : '#dc2626'}">
              ${(data.status || 'Active').toUpperCase()}
            </span>
          </div>
        </div>

        <div class="footer">
          <div class="seal-box">
            <div class="gold-seal">
              <span>★ OFFICIAL ★</span>
              <span>VERIFIED</span>
              <span>SELLER</span>
            </div>
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #0f172a;">Issue Date: ${data.issueDate}</div>
              <div style="font-size: 11px; color: #64748b;">Valid Since: ${data.validSince}</div>
            </div>
          </div>

          <div class="qr-placeholder">
            QR CODE<br/>VERIFIED
          </div>

          <div class="signature-box">
            <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 24px; color: #1e3a8a; margin-bottom: 2px;">Marketplace Director</div>
            <div class="signature-line"></div>
            <div class="signature-title">Authorized Digital Signature</div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
