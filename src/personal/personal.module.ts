import { Module } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { PersonalController } from './personal.controller';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseModule],
  controllers: [PersonalController, PerformanceController],
  providers: [PersonalService, PerformanceService],
})
export class PersonalModule { }
