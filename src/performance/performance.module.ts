import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
    imports: [FirebaseModule],
    controllers: [PerformanceController],
    providers: [PerformanceService],
    exports: [PerformanceService],
})
export class PerformanceModule { }
