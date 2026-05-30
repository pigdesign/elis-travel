import { Client } from "basic-ftp";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";

export class FtpStorageService {
  private host = process.env.FTP_HOST || "ftp.rivieratransfer.com";
  private user = process.env.FTP_USER || "ftp-image@elis-travel.it";
  private password = process.env.FTP_PASSWORD || "VBnh?Fj!{u@#57!E";
  private port = Number(process.env.FTP_PORT) || 21;
  // L'utente FTP è già confinato nella cartella corretta, quindi carichiamo nella root dell'FTP "/"
  private destFolder = process.env.FTP_DEST_FOLDER || "/";
  private baseUrl = process.env.FTP_BASE_URL || "https://elis-travel.it/ftp-image";

  async uploadFile(fileStream: Readable, originalName: string): Promise<string> {
    const client = new Client();
    client.ftp.verbose = false;
    
    try {
      await client.access({
        host: this.host,
        user: this.user,
        password: this.password,
        port: this.port,
        secure: true,
        secureOptions: { rejectUnauthorized: false },
      });

      // Try to use secure if needed, but let's stick to standard FTP over 21 first, basic-ftp can upgrade if we use secure: true.
      // Wait, "FTPS esplicita" means STARTTLS. So secure: true is good for explicit FTPS.
      // Actually, basic-ftp: secure: true uses explicit FTPS.
      
      const ext = path.extname(originalName);
      const fileName = `${randomUUID()}${ext}`;

      await client.ensureDir(this.destFolder);
      await client.uploadFrom(fileStream, fileName);

      return `${this.baseUrl}/${fileName}`;
    } finally {
      client.close();
    }
  }
}
