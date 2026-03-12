import { Module } from '@nestjs/common';
import { RotacionHistorialService } from './rotacion-historial.service';
import { RotacionHistorialController } from './rotacion-historial.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseClientModule],
  providers: [RotacionHistorialService],
  controllers: [RotacionHistorialController],
})
export class RotacionHistorialModule { }
