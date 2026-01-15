import { join } from 'path';
import { REGISTRATION_PHOTO_PATH } from '../config/constants.js';

let cachedFileId: string | null = null;

const photoPath = join(process.cwd(), REGISTRATION_PHOTO_PATH);

export function getRegistrationPhotoPath(): string {
    return photoPath;
}

export function getRegistrationPhotoFileId(): string | null {
    return cachedFileId;
}

export function setRegistrationPhotoFileId(fileId: string): void {
    cachedFileId = fileId;
}

