import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonalModule } from './personal/personal.module';
import { EquiposModule } from './equipos/equipos.module';
import { HistorialRotacionesModule } from './historial-rotaciones/historial-rotaciones.module';
import { ModulosSidebarModule } from './modulos-sidebar/modulos-sidebar.module';
import { OperacionesModule } from './operaciones/operaciones.module';
import { AdministracionDatosModule } from './administracion-datos/administracion-datos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PersonalModule,
    EquiposModule,
    HistorialRotacionesModule,
    ModulosSidebarModule,
    OperacionesModule,
    AdministracionDatosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
