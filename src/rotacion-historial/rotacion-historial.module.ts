import { Module } from '@nestjs/common';
import { RotacionHistorialService } from './rotacion-historial.service';
import { RotacionHistorialController } from './rotacion-historial.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseModule],
  providers: [RotacionHistorialService],
  controllers: [RotacionHistorialController],
})
export class RotacionHistorialModule { }
