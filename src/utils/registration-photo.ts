import { join } from 'path';

let cachedFileId: string | null = null;

const photoPath = join(process.cwd(), 'assets/registration-photo.jpg');

export function getRegistrationPhotoPath(): string {
    return photoPath;
}

export function getRegistrationPhotoFileId(): string | null {
    return cachedFileId;
}

export function setRegistrationPhotoFileId(fileId: string): void {
    cachedFileId = fileId;
}

