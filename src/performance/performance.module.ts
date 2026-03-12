import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';

@Module({
    imports: [FirebaseClientModule],
    controllers: [PerformanceController],
    providers: [PerformanceService],
    exports: [PerformanceService],
})
export class PerformanceModule { }
