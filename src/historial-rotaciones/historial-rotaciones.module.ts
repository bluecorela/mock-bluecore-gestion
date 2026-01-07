import { Module } from '@nestjs/common';
import { HistorialRotacionesService } from './historial-rotaciones.service';
import { HistorialRotacionesController } from './historial-rotaciones.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseModule],
  providers: [HistorialRotacionesService],
  controllers: [HistorialRotacionesController],
})
export class HistorialRotacionesModule {}
