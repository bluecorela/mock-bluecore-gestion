import { Injectable } from '@nestjs/common';
import { FirebaseClient } from '../firebase/firebase.client';

@Injectable()
export class MaintenanceService {
    constructor(private readonly firebaseClient: FirebaseClient) { }

    async getStatus() {
        const status = await this.firebaseClient.getMaintenanceStatus();
        return {
            active: status?.active ?? false,
        };
    }
}
