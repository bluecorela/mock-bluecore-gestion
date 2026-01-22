import { Module } from '@nestjs/common';
import { AdministracionDatosService } from './administracion-datos.service';
import { AdministracionDatosController } from './administracion-datos.controller';
import { FirebaseClient } from 'src/firebase/firebase.client';

@Module({
  
  providers: [AdministracionDatosService, FirebaseClient],
  controllers: [AdministracionDatosController]
})
export class AdministracionDatosModule {}
