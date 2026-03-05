import { Module } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { PersonalController } from './personal.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseClientModule],
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule { }
