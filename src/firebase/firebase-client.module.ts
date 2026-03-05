import { Module } from '@nestjs/common';
import { FirebaseClient } from './firebase.client';

@Module({
  providers: [FirebaseClient],
  exports: [FirebaseClient],
})
export class FirebaseClientModule { }
