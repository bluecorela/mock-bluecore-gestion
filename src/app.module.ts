import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonalModule } from './personal/personal.module';
import { EquiposModule } from './equipos/equipos.module';
import { RotacionHistorialModule } from './rotacion-historial/rotacion-historial.module';
import { ModulosSidebarModule } from './modulos-sidebar/modulos-sidebar.module';
import { OperacionesModule } from './operaciones/operaciones.module';
import { RotacionModule } from './rotacion/rotacion.module';
import { OtoModule } from './oto/oto.module';
import { PerformanceModule } from './performance/performance.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PersonalModule,
    EquiposModule,
    RotacionHistorialModule,
    ModulosSidebarModule,
    OperacionesModule,
    RotacionModule,
    OtoModule,
    PerformanceModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
