import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly apiUrl = 'https://api.brevo.com/v3';
  private readonly apiKey: string;
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly httpService: HttpService,
    private configService: ConfigService,
  ) {
    // ✅ Correction 1 : Vérifier et typer correctement
    const key = this.configService.get<string>('BREVO_API_KEY');
    if (!key) {
      this.logger.warn('BREVO_API_KEY not configured. SMS service will be disabled.');
      this.apiKey = '';
    } else {
      this.apiKey = key;
    }
  }

  async sendVerificationCode(phoneNumber: string, code: string): Promise<any> {
    if (!this.apiKey) {
      this.logger.warn('SMS not sent: API key missing');
      return { mock: true, message: 'SMS non envoyé (clé API manquante)' };
    }

    const payload = {
      sender: 'MonApp',
      recipient: phoneNumber,
      content: `Votre code de réinitialisation est : ${code}. Valable 10 minutes.`,
      type: 'transactional',
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/transactionalSMS/sms`, payload, {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (error) {
      // ✅ Correction 2 : Gérer le type 'unknown'
      this.logger.error('Erreur Brevo SMS:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`SMS sending failed: ${errorMessage}`);
    }
  }
}