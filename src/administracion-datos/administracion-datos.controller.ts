import { Controller, Post, Body} from '@nestjs/common';
import { AdministracionDatosService } from './administracion-datos.service';

@Controller('administracion-datos')
export class AdministracionDatosController {
    constructor(private readonly administracionDatosService: AdministracionDatosService) { }    

      @Post('guardar-evaluacion')
  async guardarEvaluacion(@Body() body: any) {
    return this.administracionDatosService.guardarEvaluacion(body);
  }
}
