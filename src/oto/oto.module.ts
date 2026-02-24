import { Module } from '@nestjs/common';
import { OtoService } from './oto.service';
import { OtoController } from './oto.controller';
import { FirebaseModule } from '../firebase/firebase-client.module';

@Module({
    imports: [FirebaseModule],
    controllers: [OtoController],
    providers: [OtoService],
})
export class OtoModule { }
