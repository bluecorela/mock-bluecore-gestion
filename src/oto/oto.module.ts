import { Module } from '@nestjs/common';
import { OtoService } from './oto.service';
import { OtoController } from './oto.controller';
import { FirebaseClientModule } from '../firebase/firebase-client.module';

@Module({
    imports: [FirebaseClientModule],
    controllers: [OtoController],
    providers: [OtoService],
})
export class OtoModule { }
