export class AppError extends Error {
  public technicalDetail?: string;

  constructor(message: string, technicalDetail?: string) {
    super(message);
    this.name = this.constructor.name;
    this.technicalDetail = technicalDetail;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DuplicateError extends AppError {
  constructor(message = "Dieser Eintrag existiert bereits.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Ungültige Eingabe.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export class MigrationError extends AppError {
  constructor(message = "Fehler bei der Datenbank-Migration.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export class ImportError extends AppError {
  constructor(message = "Fehler beim Importieren der Daten.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Eintrag nicht gefunden.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export class NetworkError extends AppError {
  constructor(message = "Netzwerkfehler. Bitte überprüfe deine Verbindung.", technicalDetail?: string) {
    super(message, technicalDetail);
  }
}

export function parseSqliteError(e: unknown, defaultMessage = "Ein unbekannter Datenbankfehler ist aufgetreten."): AppError {
  if (e instanceof Error) {
    const message = e.message;
    // 2067 is SQLite's UNIQUE constraint failed code. Some plugins might include it in the message string.
    if (message.includes("UNIQUE constraint failed") || message.includes("2067")) {
      return new DuplicateError("Ein Eintrag mit diesen Daten existiert bereits.", message);
    }
    if (message.includes("NOT NULL constraint failed") || message.includes("1299")) {
      return new ValidationError("Ein erforderliches Feld wurde nicht ausgefüllt.", message);
    }
    return new AppError(defaultMessage, message);
  }
  return new AppError(defaultMessage, String(e));
}
