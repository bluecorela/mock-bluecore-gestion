import { Module } from '@nestjs/common';
import { ModulosSidebarService } from './modulos-sidebar.service';
import { ModulosSidebarController } from './modulos-sidebar.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseModule],
  providers: [ModulosSidebarService],
  controllers: [ModulosSidebarController]
})
export class ModulosSidebarModule {}
