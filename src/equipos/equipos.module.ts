import { Module } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { EquiposController } from './equipos.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';
import { OperacionesModule } from '../operaciones/operaciones.module';

@Module({
  imports: [FirebaseClientModule, OperacionesModule],
  controllers: [EquiposController],
  providers: [EquiposService],
})
export class EquiposModule { }
