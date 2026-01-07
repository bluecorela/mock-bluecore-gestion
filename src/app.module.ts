import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonalModule } from './personal/personal.module';
import { EquiposModule } from './equipos/equipos.module';
import { HistorialRotacionesModule } from './historial-rotaciones/historial-rotaciones.module';
import { ModulosSidebarModule } from './modulos-sidebar/modulos-sidebar.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PersonalModule,
    EquiposModule,
    HistorialRotacionesModule,
    ModulosSidebarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
