import { Module } from '@nestjs/common';
import { RotacionController } from './rotacion.controller';
import { RotacionService } from './rotacion.service';
import { FirebaseClient } from '../firebase/firebase.client';

@Module({
    controllers: [RotacionController],
    providers: [RotacionService, FirebaseClient],
})
export class RotacionModule { }
