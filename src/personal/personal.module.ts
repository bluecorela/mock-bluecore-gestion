import { Module } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { PersonalController } from './personal.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseModule],
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule { }
