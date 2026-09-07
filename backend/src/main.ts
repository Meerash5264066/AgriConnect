import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
async function bootstrap(){
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter());
 app.enableCors({origin:true,credentials:true});
 const config=new DocumentBuilder().setTitle('AgriConnect API').setDescription('Farmer, Buyer and AI-ready REST API').setVersion('1.0').addBearerAuth().build();
 SwaggerModule.setup('docs',app,SwaggerModule.createDocument(app,config));
 await app.listen(process.env.PORT?Number(process.env.PORT):3001,'0.0.0.0');
}
bootstrap();