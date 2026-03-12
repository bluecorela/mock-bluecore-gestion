import { Module } from '@nestjs/common';
import { ModulosSidebarService } from './modulos-sidebar.service';
import { ModulosSidebarController } from './modulos-sidebar.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';

@Module({
  imports: [FirebaseClientModule],
  providers: [ModulosSidebarService],
  controllers: [ModulosSidebarController]
})
export class ModulosSidebarModule { }
