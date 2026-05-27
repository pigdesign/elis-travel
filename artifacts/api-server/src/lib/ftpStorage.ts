import { Client } from "basic-ftp";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import path from "path";

export class FtpStorageService {
  private host = "ftp.rivieratransfer.com";
  private user = "ftp-image@elis-travel.it";
  private password = "VBnh?Fj!{u@#57!E";
  private port = 21;
  // L'utente FTP è già confinato nella cartella corretta, quindi carichiamo nella root dell'FTP "/"
  private destFolder = "/";
  private baseUrl = "https://elis-travel.it/ftp-image";

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
